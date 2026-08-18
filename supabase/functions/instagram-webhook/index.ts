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

    // Meta webhook verification handshake
    // When you first register the webhook URL in the Meta dashboard, Meta sends
    // a GET request with hub.mode=subscribe, hub.verify_token, and hub.challenge.
    // We must echo back hub.challenge after confirming the verify token matches.
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const expectedToken = Deno.env.get("INSTAGRAM_VERIFY_TOKEN") ?? "bolt_instagram_verify";

      if (mode === "subscribe" && token === expectedToken) {
        return new Response(challenge ?? "", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
      }
      return new Response("Forbidden", {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Incoming webhook events (comments, DMs, mentions, etc.)
    if (req.method === "POST") {
      const body = await req.json();
      console.log("Instagram webhook received:", JSON.stringify(body));

      // Meta wraps events in an "entry" array
      const entries: any[] = body?.entry ?? [];

      for (const entry of entries) {
        const igUserId = entry?.id ?? null;

        // Comments
        const changes: any[] = entry?.changes ?? [];
        for (const change of changes) {
          if (change?.field === "comments") {
            const value = change?.value ?? {};
            await storeEvent(supabaseClient, {
              event_id: value?.id ?? null,
              event_type: "comment",
              ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null,
              sender_username: value?.from?.username ?? null,
              media_id: value?.media?.id ?? null,
              comment_id: value?.id ?? null,
              message_text: value?.text ?? null,
              raw_event: change,
            });
          }
        }

        // Direct messages live in the "messaging" array
        const messaging: any[] = entry?.messaging ?? [];
        for (const msg of messaging) {
          const messageText = msg?.message?.text ?? null;
          await storeEvent(supabaseClient, {
            event_id: msg?.message?.mid ?? null,
            event_type: "message",
            ig_user_id: igUserId,
            sender_id: msg?.sender?.id ?? null,
            sender_username: null,
            media_id: null,
            comment_id: null,
            message_text: messageText,
            raw_event: msg,
          });
        }

        // Mentions, shares, and reposts
        for (const change of changes) {
          if (change?.field === "mentions") {
            const value = change?.value ?? {};
            await storeEvent(supabaseClient, {
              event_id: value?.comment_id ?? value?.id ?? null,
              event_type: "mention",
              ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null,
              sender_username: value?.from?.username ?? null,
              media_id: value?.media?.id ?? null,
              comment_id: value?.comment_id ?? null,
              message_text: value?.text ?? null,
              raw_event: change,
            });
          }
          if (change?.field === "shares") {
            const value = change?.value ?? {};
            await storeEvent(supabaseClient, {
              event_id: value?.id ?? null,
              event_type: "share",
              ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null,
              sender_username: value?.from?.username ?? null,
              media_id: value?.media?.id ?? null,
              comment_id: null,
              message_text: value?.text ?? null,
              raw_event: change,
            });
          }
          if (change?.field === "reposted") {
            const value = change?.value ?? {};
            await storeEvent(supabaseClient, {
              event_id: value?.id ?? null,
              event_type: "repost",
              ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null,
              sender_username: value?.from?.username ?? null,
              media_id: value?.media?.id ?? null,
              comment_id: null,
              message_text: value?.text ?? null,
              raw_event: change,
            });
          }
        }
      }

      // Meta expects a 200 OK to acknowledge receipt
      return new Response(JSON.stringify({ status: "received" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Instagram webhook error:", error);
    // Still return 200 so Meta doesn't retry unnecessarily for our internal errors
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function storeEvent(
  supabaseClient: any,
  event: {
    event_id: string | null;
    event_type: string;
    ig_user_id: string | null;
    sender_id: string | null;
    sender_username: string | null;
    media_id: string | null;
    comment_id: string | null;
    message_text: string | null;
    raw_event: any;
  },
) {
  // Try to resolve the user_id from the connected Instagram account.
  // Meta may send the ig_user_id in different formats depending on the event type,
  // so we try exact match first, then fall back to matching on sender_id (for DMs
  // where the recipient id is the connected account).
  let userId: string | null = null;
  const lookups: string[] = [event.ig_user_id, event.sender_id].filter(Boolean) as string[];
  for (const id of lookups) {
    const { data: account } = await supabaseClient
      .from("instagram_accounts")
      .select("user_id")
      .eq("ig_user_id", id)
      .maybeSingle();
    if (account?.user_id) {
      userId = account.user_id;
      break;
    }
  }

  // If still not found, try a broader search: get all accounts and check if
  // the ig_user_id from the webhook matches as a substring or if the stored
  // ig_user_id contains the webhook id (Meta sometimes uses different ID scopes)
  if (!userId && event.ig_user_id) {
    const { data: allAccounts } = await supabaseClient
      .from("instagram_accounts")
      .select("id, user_id, ig_user_id");
    for (const acct of allAccounts ?? []) {
      if (acct.ig_user_id && (
        acct.ig_user_id === event.ig_user_id ||
        acct.ig_user_id.includes(event.ig_user_id) ||
        event.ig_user_id.includes(acct.ig_user_id)
      )) {
        userId = acct.user_id;
        break;
      }
    }
  }

  // Deduplicate by event_id — Meta retries events
  if (event.event_id) {
    const { data: existing } = await supabaseClient
      .from("instagram_webhook_events")
      .select("id")
      .eq("event_id", event.event_id)
      .maybeSingle();
    if (existing) return;
  }

  await supabaseClient.from("instagram_webhook_events").insert({
    user_id: userId,
    event_id: event.event_id,
    event_type: event.event_type,
    ig_user_id: event.ig_user_id,
    sender_id: event.sender_id,
    sender_username: event.sender_username,
    media_id: event.media_id,
    comment_id: event.comment_id,
    message_text: event.message_text,
    raw_event: event.raw_event,
  });
}
