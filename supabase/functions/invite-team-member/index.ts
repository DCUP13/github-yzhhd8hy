import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, organization_id, invited_by, role } = await req.json();

    if (!email || !organization_id) {
      return new Response(JSON.stringify({ error: "Missing email or organization_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if user is manager/owner of the org
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .maybeSingle();

    const isSuperAdmin = (await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()).data?.role === "super_admin";

    if (!isSuperAdmin && (!membership || (membership.role !== "owner" && membership.role !== "manager"))) {
      return new Response(JSON.stringify({ error: "Only managers or owners can invite members" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (membership?.role === "manager" && role === "manager") {
      return new Response(JSON.stringify({ error: "Managers can only invite members, not other managers" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check for existing pending invitation
    const { data: existing } = await supabase
      .from("member_invitations")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("email", email.toLowerCase())
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "An active invitation already exists for this email" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: inviteError } = await supabase.from("member_invitations").insert({
      organization_id,
      email: email.toLowerCase(),
      role: role || "member",
      invited_by: invited_by || user.id,
      expires_at: expiresAt.toISOString(),
    });

    if (inviteError) throw new Error(`Failed to create invitation: ${inviteError.message}`);

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      const { error: memberError } = await supabase
        .from("organization_members")
        .insert({ organization_id, user_id: existingUser.id, role: role || "member", status: "active" });

      if (memberError && !memberError.message.includes("duplicate")) {
        console.error("Failed to add existing user:", memberError);
      }

      await supabase
        .from("member_invitations")
        .update({ status: "accepted" })
        .eq("organization_id", organization_id)
        .eq("email", email.toLowerCase());
    } else {
      // Create auth user with temp password
      const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"[b % 56])
        .join("");

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(),
        password: tempPassword,
        email_confirm: true,
      });

      if (createError) {
        console.error("Failed to create user:", createError);
      } else if (newUser.user) {
        const { error: memberError } = await supabase
          .from("organization_members")
          .insert({ organization_id, user_id: newUser.user.id, role: role || "member", status: "active" });

        if (memberError) console.error("Failed to add new user:", memberError);

        await supabase
          .from("member_invitations")
          .update({ status: "accepted" })
          .eq("organization_id", organization_id)
          .eq("email", email.toLowerCase());
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error in invite-team-member:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
