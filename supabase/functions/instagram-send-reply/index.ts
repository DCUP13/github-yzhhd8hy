import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getApiBase(accessToken: string): string {
  return accessToken.startsWith("IGAA")
    ? "https://graph.instagram.com"
    : "https://graph.facebook.com";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const { account_id, recipient_id, message_text, reply_to_event_id } = body as {
      account_id?: string;
      recipient_id?: string;
      message_text?: string;
      reply_to_event_id?: string;
    };

    if (!account_id || !recipient_id || !message_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: account_id, recipient_id, message_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load the account
    const { data: account, error: accountError } = await supabase
      .from("instagram_accounts")
      .select("id, access_token, page_scoped_id, user_id")
      .eq("id", account_id)
      .maybeSingle();

    if (accountError || !account?.access_token) {
      return new Response(
        JSON.stringify({ error: "Account not found or no access token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send the message via Instagram API
    const apiBase = getApiBase(account.access_token);
    const sendUrl = `${apiBase}/v21.0/${account.page_scoped_id}/messages?access_token=${account.access_token}`;

    const sendResponse = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipient_id },
        message: { text: message_text },
      }),
    });

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      console.error("Instagram send error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send Instagram message", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sendData = await sendResponse.json();
    const messageId = sendData?.message_id ?? `manual_${Date.now()}`;

    // Store the outgoing message in webhook events
    await supabase.from("instagram_webhook_events").insert({
      event_id: messageId,
      event_type: "message",
      ig_user_id: account.page_scoped_id,
      sender_id: account.page_scoped_id,
      sender_username: null,
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
      raw_event: { manual_reply: true, message_id: messageId },
    });

    // Mark the original incoming event as replied
    if (reply_to_event_id) {
      await supabase
        .from("instagram_webhook_events")
        .update({ reply_text: message_text, replied_at: new Date().toISOString() })
        .eq("id", reply_to_event_id);
    }

    return new Response(
      JSON.stringify({ success: true, message_id: messageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("instagram-send-reply error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
