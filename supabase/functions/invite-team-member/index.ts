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

  const log = (msg: string, data?: unknown) => {
    if (data !== undefined) {
      console.error(`[invite-team-member] ${msg}`, JSON.stringify(data, null, 2));
    } else {
      console.error(`[invite-team-member] ${msg}`);
    }
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log("No Authorization header on incoming request");
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      supabaseUrl, anonKey,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      log("getUser failed", userError);
      return new Response(JSON.stringify({ error: "Unauthorized — your session may have expired." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, organization_id, invited_by, role } = await req.json();
    log("Request received", { email, organization_id, role, invited_by, userId: user.id });

    if (!email || !organization_id) {
      return new Response(JSON.stringify({ error: "Missing email or organization_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is manager/owner of the org
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) {
      log("Failed to look up membership", membershipError);
      return new Response(JSON.stringify({ error: "Failed to verify your organization membership." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!membership || (membership.role !== "owner" && membership.role !== "manager")) {
      log("Permission denied — caller is not manager/owner", { role: membership?.role });
      return new Response(JSON.stringify({ error: "Only managers or owners can invite members" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (membership.role === "manager" && role === "manager") {
      return new Response(JSON.stringify({ error: "Managers can only invite members, not other managers" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Fetch org name
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .maybeSingle();

    if (orgError) log("Failed to fetch org name", orgError);

    // Fetch invitation address from the inviter's SES settings
    const { data: sesSettings, error: sesError } = await supabase
      .from("amazon_ses_settings")
      .select("noreply_address, noreply_domain, smtp_username, smtp_server, smtp_port")
      .eq("user_id", user.id)
      .maybeSingle();

    if (sesError) log("Failed to fetch SES settings", sesError);

    log("SES settings lookup", {
      found: !!sesSettings,
      noreply_address: sesSettings?.noreply_address ?? null,
      noreply_domain: sesSettings?.noreply_domain ?? null,
      smtp_username: sesSettings?.smtp_username ?? null,
      smtp_server: sesSettings?.smtp_server ?? null,
    });

    const fromAddress = sesSettings?.noreply_address
      ? sesSettings.noreply_address
      : sesSettings?.noreply_domain
        ? `noreply@${sesSettings.noreply_domain}`
        : sesSettings?.smtp_username || "noreply@mail.example.com";

    log("Using from address", { fromAddress });

    // Insert the invitation record
    const { error: inviteError } = await supabase.from("member_invitations").insert({
      organization_id,
      email: email.toLowerCase(),
      role: role || "member",
      invited_by: invited_by || user.id,
      temporary_password: tempPassword,
      expires_at: expiresAt.toISOString(),
    });

    if (inviteError) {
      log("Failed to insert invitation", inviteError);
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

    // Insert into the outbox using "body" (the field send-email reads)
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
      log("Failed to insert into email_outbox", outboxError);
      return new Response(JSON.stringify({
        error: `Invitation created but failed to queue email: ${outboxError.message}. The email will not be sent until this is fixed.`,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Email inserted into outbox", { outboxId: outboxRow.id });

    // ── Trigger send-email using the ORIGINAL user's JWT ──────────────
    // send-email calls auth.getUser() to verify the caller, so we must
    // forward the real user JWT — NOT the service role key.
    let emailSent = false;
    let sendErrorDetail = "";

    try {
      const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "apikey": anonKey,
        },
        body: JSON.stringify({ emailId: outboxRow.id }),
      });

      const sendResult = await sendResponse.json().catch(() => ({}));
      log("send-email response", { status: sendResponse.status, body: sendResult });

      if (!sendResponse.ok) {
        sendErrorDetail = sendResult.error || `send-email returned HTTP ${sendResponse.status}`;
        log("send-email failed", { status: sendResponse.status, error: sendErrorDetail });
      } else {
        // Check if the email was actually sent or failed
        const results = sendResult.results || [];
        const thisResult = results.find((r: { id: string }) => r.id === outboxRow.id);
        if (thisResult?.status === "failed") {
          sendErrorDetail = thisResult.error || "send-email processed the email but it failed";
          log("send-email marked email as failed", thisResult);
        } else {
          emailSent = true;
          log("Email sent successfully");
        }
      }
    } catch (triggerError) {
      sendErrorDetail = triggerError instanceof Error ? triggerError.message : String(triggerError);
      log("Exception while calling send-email", triggerError);
    }

    // Build the response with full diagnostic info
    if (!emailSent) {
      const warnings: string[] = [];
      if (!sesSettings) {
        warnings.push("No Amazon SES settings found for your account. Configure your AWS SES credentials in Settings → Amazon SES.");
      } else if (!sesSettings.smtp_username || sesSettings.smtp_username.length < 10) {
        warnings.push("Your Amazon SES settings look incomplete or invalid. The SMTP username in Settings → Amazon SES appears to be a placeholder.");
      }
      if (fromAddress === "noreply@mail.example.com") {
        warnings.push("No invitation address is configured. Set a custom invitation address (e.g. noreply@yourdomain.com) in Settings → Amazon SES.");
      }

      const fullError = sendErrorDetail
        ? `Invitation created but the email could not be sent: ${sendErrorDetail}`
        : "Invitation created but the email could not be sent.";

      return new Response(JSON.stringify({
        success: true,
        email_sent: false,
        error: fullError,
        warnings,
        outbox_id: outboxRow.id,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      email_sent: true,
      message: `Invitation sent to ${email.toLowerCase()}`,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    log("Unhandled error", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
