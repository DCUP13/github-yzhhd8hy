import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InviteRequest {
  email: string;
  role: "manager" | "member";
  organization_id: string;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

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

    if (!profile || profile.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Only the platform owner can send invitations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, role, organization_id } = (await req.json()) as InviteRequest;

    if (!email || !role || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing email, role, or organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organization_id)
      .maybeSingle();

    if (!org) {
      return new Response(
        JSON.stringify({ error: "Organization not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingPending } = await supabase
      .from("invitations")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      return new Response(
        JSON.stringify({ error: "An active invitation already exists for this email" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingMember } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .maybeSingle();

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: inviteError } = await supabase.from("invitations").insert({
      organization_id,
      email: email.toLowerCase(),
      role,
      token,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    });

    if (inviteError) {
      throw new Error(`Failed to create invitation: ${inviteError.message}`);
    }

    const tempPassword = generatePassword();
    const appUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "") || "";

    const inviteLink = `${new URL(req.url).origin.replace(/:\d+$/, "")}/#invite=${token}`;

    const { error: emailError } = await supabase.functions.invoke("send-email", {
      body: {
        to_email: email,
        from_email: "noreply@loiblast.com",
        subject: `You're invited to join ${org.name} on LoiBlast`,
        body: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2d4a3e;">You're Invited to ${org.name}</h2>
            <p>You've been invited to join <strong>${org.name}</strong> on LoiBlast as a <strong>${role}</strong>.</p>
            <p>Your temporary password is: <code style="font-size: 18px; font-weight: bold; padding: 8px 12px; background: #f5f0e1; border-radius: 4px;">${tempPassword}</code></p>
            <p style="margin: 24px 0;">
              <a href="${inviteLink}" style="display: inline-block; padding: 12px 28px; background: #2d4a3e; color: #f5f0e1; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
            </p>
            <p>This invitation expires in 7 days. Please sign in and change your password in Settings.</p>
            <p style="color: #888; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        `,
        attachments: [],
        user_id: user.id,
      },
    });

    let emailSent = !emailError;
    if (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }

    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      const { error: memberError } = await supabase
        .from("organization_members")
        .insert({
          organization_id,
          user_id: existingUser.id,
          role,
          status: "active",
        });

      if (memberError && !memberError.message.includes("duplicate")) {
        console.error("Failed to add existing user to org:", memberError);
      }

      await supabase
        .from("invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("token", token);
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(),
        password: tempPassword,
        email_confirm: true,
      });

      if (createError) {
        console.error("Failed to create user account:", createError);
      } else if (newUser.user) {
        const { error: memberError } = await supabase
          .from("organization_members")
          .insert({
            organization_id,
            user_id: newUser.user.id,
            role,
            status: "active",
          });

        if (memberError) {
          console.error("Failed to add new user to org:", memberError);
        }

        await supabase
          .from("invitations")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("token", token);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        token,
        email_sent: emailSent,
        message: existingUser
          ? "User already exists and has been added to the organization"
          : "Invitation sent and account created",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in invite-member:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
