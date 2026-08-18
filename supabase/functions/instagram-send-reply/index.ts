import { createClient } from "npm:@supabase/supabase-js@2";

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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { account_id, recipient_id, message_text, reply_to_event_id } = body;

    if (!account_id || !recipient_id || !message_text) {
      return new Response(JSON.stringify({ error: "Missing required fields: account_id, recipient_id, message_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the Instagram account and verify ownership
    const { data: account, error: acctErr } = await supabaseClient
      .from("instagram_accounts")
      .select("id, user_id, access_token, ig_user_id, page_scoped_id")
      .eq("id", account_id)
      .maybeSingle();

    if (acctErr || !account) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user owns this account
    if (account.user_id !== user.id) {
      // Check if the account is shared with this user with reply permission
      const { data: share } = await supabaseClient
        .from("instagram_account_shares")
        .select("permissions")
        .eq("account_id", account_id)
        .eq("shared_with_user_id", user.id)
        .maybeSingle();

      if (!share || !share.permissions?.reply) {
        return new Response(JSON.stringify({ error: "You don't have permission to reply from this account" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!account.access_token) {
      return new Response(JSON.stringify({ error: "No access token for this account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send the DM via the Instagram Messaging API
    // The sender is the connected IG account, recipient is the other party
    const senderId = account.ig_user_id;
    const sendUrl = `https://graph.facebook.com/v21.0/${senderId}/messages`;

    const sendBody: any = {
      recipient: { id: recipient_id },
      message: { text: message_text },
    };

    const sendRes = await fetch(`${sendUrl}?access_token=${account.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendBody),
    });

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      console.error("Instagram send reply failed:", errBody);
      let errorMsg = "Failed to send message";
      try {
        const errJson = JSON.parse(errBody);
        errorMsg = errJson?.error?.message ?? errorMsg;
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendData = await sendRes.json();
    const messageId = sendData?.message_id ?? null;

    // Store the outgoing message in webhook_events so it appears in the conversation
    await supabaseClient.from("instagram_webhook_events").insert({
      user_id: account.user_id,
      event_id: messageId ?? `reply_${Date.now()}`,
      event_type: "message",
      ig_user_id: account.page_scoped_id ?? account.ig_user_id,
      sender_id: account.page_scoped_id ?? account.ig_user_id,
      sender_username: account.username ?? null,
      sender_name: null,
      sender_profile_url: null,
      media_id: null,
      media_type: null,
      media_permalink: null,
      media_caption: null,
      comment_id: null,
      message_text: message_text,
      direction: "outgoing",
      recipient_id: recipient_id,
      reply_text: message_text,
      replied_at: new Date().toISOString(),
      raw_event: { sent_from_app: true, message_id: messageId, recipient_id },
    });

    // If replying to a specific event, mark it as processed
    if (reply_to_event_id) {
      await supabaseClient
        .from("instagram_webhook_events")
        .update({
          processed: true,
          reply_text: message_text,
          replied_at: new Date().toISOString(),
        })
        .eq("id", reply_to_event_id);
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: messageId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send reply error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
