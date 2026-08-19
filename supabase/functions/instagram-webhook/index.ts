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

    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expectedToken = Deno.env.get("INSTAGRAM_VERIFY_TOKEN") ?? "bolt_instagram_verify";
      if (mode === "subscribe" && token === expectedToken) {
        return new Response(challenge ?? "", {
          status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
      }
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      console.log("Instagram webhook received:", JSON.stringify(body));
      const entries: any[] = body?.entry ?? [];

      for (const entry of entries) {
        const igUserId = entry?.id ?? null;
        const account = await resolveAccount(supabaseClient, igUserId);
        const accessToken = account?.access_token ?? null;
        const userId = account?.user_id ?? null;

        if (account && igUserId && !account.page_scoped_id) {
          await supabaseClient
            .from("instagram_accounts")
            .update({ page_scoped_id: igUserId })
            .eq("id", account.id);
        }

        const changes: any[] = entry?.changes ?? [];
        for (const change of changes) {
          if (change?.field === "comments") {
            const value = change?.value ?? {};
            const mediaId = value?.media?.id ?? null;
            const mediaMeta = accessToken && mediaId
              ? await fetchMediaMeta(mediaId, accessToken)
              : null;
            await storeEvent(supabaseClient, {
              event_id: value?.id ?? null, event_type: "comment", ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null, sender_username: value?.from?.username ?? null,
              sender_name: null, sender_profile_url: null,
              media_id: mediaId, media_type: mediaMeta?.media_type ?? value?.media?.media_type ?? null,
              media_permalink: mediaMeta?.permalink ?? null, media_caption: mediaMeta?.caption ?? null,
              comment_id: value?.id ?? null, message_text: value?.text ?? null,
              direction: "incoming", recipient_id: null, raw_event: change, user_id: userId,
            }, accessToken);
          }
        }

        const messaging: any[] = entry?.messaging ?? [];
        for (const msg of messaging) {
          if (msg.read || msg.delivery || msg.reaction || msg.message_edit) continue;
          const messageText = msg?.message?.text ?? null;
          if (!messageText && !msg?.message?.attachment) continue;
          const isEcho = msg?.message?.is_echo === true;
          const senderId = msg?.sender?.id ?? null;
          const recipientId = msg?.recipient?.id ?? null;
          const otherPartyId = isEcho ? recipientId : senderId;
          const storedEvent = await storeEvent(supabaseClient, {
            event_id: msg?.message?.mid ?? null, event_type: "message", ig_user_id: igUserId,
            sender_id: senderId, sender_username: null, sender_name: null, sender_profile_url: null,
            media_id: null, media_type: null, media_permalink: null, media_caption: null,
            comment_id: null, message_text: messageText,
            direction: isEcho ? "outgoing" : "incoming", recipient_id: recipientId,
            raw_event: msg, user_id: userId,
          }, accessToken, otherPartyId);

          // Trigger autoresponder for incoming (non-echo) DMs
          if (!isEcho && storedEvent && account && senderId && messageText) {
            tryFireAutoresponder(supabaseClient, {
              eventId: storedEvent.id,
              accountId: account.id,
              senderId,
              messageText,
              senderName: storedEvent.sender_name ?? storedEvent.sender_username ?? 'Someone',
              igUserId,
            });
          }
        }

        for (const change of changes) {
          if (change?.field === "mentions") {
            const value = change?.value ?? {};
            const mediaId = value?.media?.id ?? null;
            const mediaMeta = accessToken && mediaId
              ? await fetchMediaMeta(mediaId, accessToken)
              : null;
            await storeEvent(supabaseClient, {
              event_id: value?.comment_id ?? value?.id ?? null, event_type: "mention", ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null, sender_username: value?.from?.username ?? null,
              sender_name: null, sender_profile_url: null,
              media_id: mediaId, media_type: mediaMeta?.media_type ?? null,
              media_permalink: mediaMeta?.permalink ?? null, media_caption: mediaMeta?.caption ?? null,
              comment_id: value?.comment_id ?? null, message_text: value?.text ?? null,
              direction: "incoming", recipient_id: null, raw_event: change, user_id: userId,
            }, accessToken);
          }
          if (change?.field === "shares") {
            const value = change?.value ?? {};
            await storeEvent(supabaseClient, {
              event_id: value?.id ?? null, event_type: "share", ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null, sender_username: value?.from?.username ?? null,
              sender_name: null, sender_profile_url: null,
              media_id: value?.media?.id ?? null, media_type: null, media_permalink: null, media_caption: null,
              comment_id: null, message_text: value?.text ?? null,
              direction: "incoming", recipient_id: null, raw_event: change, user_id: userId,
            }, accessToken);
          }
          if (change?.field === "reposted") {
            const value = change?.value ?? {};
            await storeEvent(supabaseClient, {
              event_id: value?.id ?? null, event_type: "repost", ig_user_id: igUserId,
              sender_id: value?.from?.id ?? null, sender_username: value?.from?.username ?? null,
              sender_name: null, sender_profile_url: null,
              media_id: value?.media?.id ?? null, media_type: null, media_permalink: null, media_caption: null,
              comment_id: null, message_text: value?.text ?? null,
              direction: "incoming", recipient_id: null, raw_event: change, user_id: userId,
            }, accessToken);
          }
        }
      }

      return new Response(JSON.stringify({ status: "received" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Instagram webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getApiBase(accessToken: string): string {
  return accessToken.startsWith("IGAA")
    ? "https://graph.instagram.com"
    : "https://graph.facebook.com";
}

async function resolveAccount(
  supabaseClient: any,
  igUserId: string | null,
): Promise<{ id: string; user_id: string; access_token: string | null; page_scoped_id: string | null } | null> {
  if (!igUserId) return null;

  const { data: exact } = await supabaseClient
    .from("instagram_accounts")
    .select("id, user_id, access_token, page_scoped_id, ig_user_id")
    .eq("ig_user_id", igUserId)
    .maybeSingle();
  if (exact) return exact;

  const { data: byPageId } = await supabaseClient
    .from("instagram_accounts")
    .select("id, user_id, access_token, page_scoped_id, ig_user_id")
    .eq("page_scoped_id", igUserId)
    .maybeSingle();
  if (byPageId) return byPageId;

  const { data: allAccounts } = await supabaseClient
    .from("instagram_accounts")
    .select("id, user_id, access_token, page_scoped_id, ig_user_id");
  for (const acct of allAccounts ?? []) {
    if (acct.ig_user_id && (
      acct.ig_user_id === igUserId ||
      acct.ig_user_id.includes(igUserId) ||
      igUserId.includes(acct.ig_user_id)
    )) {
      return acct;
    }
  }
  return null;
}

async function fetchMediaMeta(mediaId: string, accessToken: string): Promise<{ media_type: string; permalink: string; caption: string } | null> {
  try {
    const apiBase = getApiBase(accessToken);
    const url = `${apiBase}/v21.0/${mediaId}?fields=media_type,permalink,caption&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      media_type: data.media_type ?? null,
      permalink: data.permalink ?? null,
      caption: data.caption ?? null,
    };
  } catch {
    return null;
  }
}

async function resolveSenderProfile(
  senderId: string,
  accessToken: string,
): Promise<{ username: string; name: string; profile_pic: string } | null> {
  try {
    const apiBase = getApiBase(accessToken);
    const url = `${apiBase}/v21.0/${senderId}?fields=username,name,profile_pic&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      username: data.username ?? null,
      name: data.name ?? null,
      profile_pic: data.profile_pic ?? null,
    };
  } catch {
    return null;
  }
}

async function storeEvent(
  supabaseClient: any,
  event: {
    event_id: string | null; event_type: string; ig_user_id: string | null;
    sender_id: string | null; sender_username: string | null; sender_name: string | null;
    sender_profile_url: string | null; media_id: string | null; media_type: string | null;
    media_permalink: string | null; media_caption: string | null; comment_id: string | null;
    message_text: string | null; direction: string; recipient_id: string | null;
    raw_event: any; user_id: string | null;
  },
  accessToken: string | null = null,
  otherPartyId: string | null = null,
): Promise<{ id: string; sender_name: string | null; sender_username: string | null } | null> {
  let userId = event.user_id;

  if (!userId && event.sender_id) {
    const { data: acct } = await supabaseClient
      .from("instagram_accounts")
      .select("user_id")
      .or(`ig_user_id.eq.${event.sender_id},page_scoped_id.eq.${event.sender_id}`)
      .maybeSingle();
    if (acct?.user_id) userId = acct.user_id;
  }

  if (event.event_id) {
    const { data: existing } = await supabaseClient
      .from("instagram_webhook_events")
      .select("id")
      .eq("event_id", event.event_id)
      .maybeSingle();
    if (existing) return null;
  }

  let senderUsername = event.sender_username;
  let senderName = event.sender_name;
  let senderProfileUrl = event.sender_profile_url;

  if (!senderUsername && otherPartyId && accessToken && event.event_type === "message") {
    const profile = await resolveSenderProfile(otherPartyId, accessToken);
    if (profile) {
      senderUsername = profile.username;
      senderName = profile.name;
      senderProfileUrl = profile.profile_pic;
    }
  }

  const { data, error } = await supabaseClient.from("instagram_webhook_events").insert({
    user_id: userId, event_id: event.event_id, event_type: event.event_type,
    ig_user_id: event.ig_user_id, sender_id: event.sender_id,
    sender_username: senderUsername, sender_name: senderName, sender_profile_url: senderProfileUrl,
    media_id: event.media_id, media_type: event.media_type,
    media_permalink: event.media_permalink, media_caption: event.media_caption,
    comment_id: event.comment_id, message_text: event.message_text,
    direction: event.direction, recipient_id: event.recipient_id,
    raw_event: event.raw_event,
  }).select("id, sender_name, sender_username").single();

  if (error) {
    console.error("storeEvent insert error:", error);
    return null;
  }
  return data;
}

// Fire-and-forget: triggers the autoresponder edge function asynchronously
async function tryFireAutoresponder(
  supabaseClient: any,
  params: {
    eventId: string;
    accountId: string;
    senderId: string;
    messageText: string;
    senderName: string;
    igUserId: string | null;
  },
) {
  try {
    // Fetch recent conversation history for context
    const { data: recentMessages } = await supabaseClient
      .from("instagram_webhook_events")
      .select("direction, message_text, created_at")
      .or(`sender_id.eq.${params.senderId},recipient_id.eq.${params.senderId}`)
      .eq("event_type", "message")
      .order("created_at", { ascending: true })
      .limit(10);

    const conversationHistory = (recentMessages ?? [])
      .map((m: any) => `${m.direction === 'outgoing' ? 'You' : 'Them'}: ${m.message_text ?? '(no text)'}`)
      .join('\n');

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    await fetch(`${supabaseUrl}/functions/v1/instagram-autoresponder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        event_id: params.eventId,
        account_id: params.accountId,
        sender_id: params.senderId,
        message_text: params.messageText,
        conversation_history: conversationHistory,
        sender_name: params.senderName,
      }),
    });
  } catch (err) {
    console.error("Autoresponder trigger error (non-fatal):", err);
  }
}
