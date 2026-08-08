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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, organization_id, invited_by, role } = await req.json();

    if (!email || !organization_id) {
      return new Response(JSON.stringify({ error: "Missing email or organization_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is manager/owner of the org
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || (membership.role !== "owner" && membership.role !== "manager")) {
      return new Response(JSON.stringify({ error: "Only managers or owners can invite members" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Managers cannot invite other managers
    if (membership.role === "manager" && role === "manager") {
      return new Response(JSON.stringify({ error: "Managers can only invite members, not other managers" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block owner assignment
    if (role === "owner") {
      return new Response(JSON.stringify({ error: "Cannot assign owner role via invitation" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "An active invitation already exists for this email" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a temporary password
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => chars[b % chars.length])
      .join("");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Fetch org name for the email
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .maybeSingle();

    // Fetch invitation address from the inviter's SES settings
    const { data: sesSettings } = await supabase
      .from("amazon_ses_settings")
      .select("noreply_address, noreply_domain, smtp_username")
      .eq("user_id", user.id)
      .maybeSingle();

    const fromAddress = sesSettings?.noreply_address
      ? sesSettings.noreply_address
      : sesSettings?.noreply_domain
        ? `noreply@${sesSettings.noreply_domain}`
        : sesSettings?.smtp_username || "noreply@mail.example.com";

    const { error: inviteError } = await supabase.from("member_invitations").insert({
      organization_id,
      email: email.toLowerCase(),
      role: role || "member",
      invited_by: invited_by || user.id,
      temporary_password: tempPassword,
      expires_at: expiresAt.toISOString(),
    });

    if (inviteError) {
      return new Response(JSON.stringify({ error: `Failed to create invitation: ${inviteError.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgName = org?.name || "your organization";
    const assignedRole = role || "member";

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to join ${orgName}</h2>
        <p>You've been invited to join <strong>${orgName}</strong> as a ${assignedRole}.</p>
        <h3>Login Details</h3>
        <p><strong>Email:</strong> ${email.toLowerCase()}</p>
        <p><strong>Temporary Password:</strong> <code style="padding: 8px 12px; background: #f3f4f6; border-radius: 4px; font-size: 16px;">${tempPassword}</code></p>
        <p><strong>Role:</strong> ${assignedRole.charAt(0).toUpperCase() + assignedRole.slice(1)}</p>
        <h3>To get started:</h3>
        <ol>
          <li>Go to the login page</li>
          <li>Select "${assignedRole === "manager" ? "Manager" : "Member"}" as your login type</li>
          <li>Use the email and temporary password above</li>
          <li>You'll be prompted to change your password after first login</li>
        </ol>
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `;

    // Insert into the outbox — use "body" (not "html_body") so the send-email
    // function can read it, since send-email looks for email.body.
    const { data: outboxRow, error: outboxError } = await supabase
      .from("email_outbox")
      .insert({
        user_id: user.id,
        to_email: email.toLowerCase(),
        from_email: fromAddress,
        subject: `You've been invited to join ${orgName}`,
        body: htmlBody,
        status: "pending",
      })
      .select("id")
      .single();

    if (outboxError) {
      console.error("Failed to insert into outbox:", outboxError);
    } else {
      // Trigger the send-email function to process this specific email immediately
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ emailId: outboxRow.id }),
        });
      } catch (triggerError) {
        console.error("Failed to trigger send-email:", triggerError);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in invite-team-member:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
