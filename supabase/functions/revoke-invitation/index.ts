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
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isOwner = profile?.role === "super_admin";

    const { invitation_id } = (await req.json()) as { invitation_id: string };

    if (!invitation_id) {
      return new Response(
        JSON.stringify({ error: "Missing invitation_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .select("id, email, organization_id, status, role")
      .eq("id", invitation_id)
      .maybeSingle();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let isManager = false;
    if (!isOwner) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", invitation.organization_id)
        .eq("status", "active")
        .maybeSingle();
      isManager = membership?.role === "manager";
    }

    if (!isOwner && !isManager) {
      return new Response(
        JSON.stringify({ error: "Only the platform owner or organization managers can revoke invitations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark the invitation as revoked
    await supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", invitation_id);

    // Find and completely delete the user's auth account so the password is invalidated
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", invitation.email)
      .maybeSingle();

    if (userProfile) {
      // Remove from all organizations
      await supabase
        .from("organization_members")
        .delete()
        .eq("user_id", userProfile.id);

      // Delete the auth user entirely — this invalidates the password permanently
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userProfile.id);
      if (deleteError) {
        console.error("Failed to delete user account:", deleteError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invitation revoked and account for ${invitation.email} has been completely deleted.` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in revoke-invitation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
