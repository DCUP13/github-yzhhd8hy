import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function graphBase(token: string): string {
  return token.startsWith("IGA")
    ? "https://graph.instagram.com"
    : "https://graph.facebook.com";
}

function authHeaders(token: string): Record<string, string> {
  if (token.startsWith("IGA")) return { Authorization: `Bearer ${token}` };
  return {};
}

function graphUrl(url: string, token: string): string {
  if (token.startsWith("IGA")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${token}`;
}

/** Resolve the correct sender ID for messaging: page_scoped_id, not ig_user_id. */
function resolveSenderId(account: Record<string, unknown>): string {
  return (account.page_scoped_id as string) || (account.ig_user_id as string) || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { account_id, recipient_id, message_text, reply_to_event_id, reply_type, comment_id, parent_comment_id } = body;

    if (!account_id || !message_text) {
      return new Response(JSON.stringify({ error: "Missing required fields: account_id, message_text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isCommentReply = reply_type === 'comment';

    if (isCommentReply && !comment_id) {
      return new Response(JSON.stringify({ error: "Missing required field: comment_id for comment reply" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isCommentReply && !recipient_id) {
      return new Response(JSON.stringify({ error: "Missing required field: recipient_id for DM reply" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: account, error: acctErr } = await supabaseClient
      .from("instagram_accounts")
      .select("id, user_id, access_token, ig_user_id, page_scoped_id, username")
      .eq("id", account_id)
      .maybeSingle();

    if (acctErr || !account) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (account.user_id !== user.id) {
      const { data: share } = await supabaseClient
        .from("instagram_account_shares")
        .select("permissions")
        .eq("account_id", account_id)
        .eq("shared_with_user_id", user.id)
        .maybeSingle();
      if (!share || !share.permissions?.reply) {
        return new Response(JSON.stringify({ error: "You don't have permission to reply from this account" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!account.access_token) {
      return new Response(JSON.stringify({ error: "No access token for this account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = account.access_token as string;
    const accountRec = account as Record<string, unknown>;
    const base = graphBase(accessToken);
    const senderId = resolveSenderId(accountRec);

    if (!senderId && !isCommentReply) {
      return new Response(JSON.stringify({ error: "No valid sender ID for this account (page_scoped_id and ig_user_id are both null)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sendUrl: string;
    let sendBody: Record<string, unknown>;

    if (isCommentReply) {
      // Comment reply: POST /{comment_id}/replies
      sendUrl = graphUrl(`${base}/v26.0/${comment_id}/replies`, accessToken);
      sendBody = { message: message_text };
    } else {
      // DM reply: POST /{senderId}/messages
      if (!senderId) {
        return new Response(JSON.stringify({ error: "No valid sender ID for this account (page_scoped_id and ig_user_id are both null)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sendUrl = graphUrl(`${base}/v26.0/${senderId}/messages`, accessToken);
      sendBody = {
        recipient: { id: recipient_id },
        message: { text: message_text },
      };
    }

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(sendBody),
    });

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      console.error("Instagram send reply failed:", errBody);
      let errorMsg = "Failed to send message";
      let windowClosed = false;
      try {
        const errJson = JSON.parse(errBody);
        errorMsg = errJson?.error?.message ?? errorMsg;
        if (errorMsg.includes("allowed window") || errorMsg.includes("24 hour") || errJson?.error?.code === 10) {
          windowClosed = true;
          errorMsg = "The 24-hour messaging window has closed. Instagram only allows replies within 24 hours of the person's last message to you. After that, standard replies are blocked.";
        }
        if (errJson?.error?.code === 190) {
          errorMsg = "Your Instagram access token is invalid or expired. Go to Settings > Instagram and click Reconnect to get a fresh token via Instagram Login.";
        }
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ error: errorMsg, window_closed: windowClosed }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendData = await sendRes.json();
    const messageId = sendData?.message_id ?? sendData?.id ?? null;

    // For comment replies, look up the parent comment's media fields so the
    // outgoing event is grouped with the same media conversation in the inbox.
    let mediaId: string | null = null;
    let mediaType: string | null = null;
    let mediaPermalink: string | null = null;
    let mediaCaption: string | null = null;
    let mediaImageUrl: string | null = null;

    if (isCommentReply && parent_comment_id) {
      const { data: parentEvent } = await supabaseClient
        .from("instagram_webhook_events")
        .select("media_id, media_type, media_permalink, media_caption, media_image_url")
        .eq("comment_id", parent_comment_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (parentEvent) {
        mediaId = parentEvent.media_id ?? null;
        mediaType = parentEvent.media_type ?? null;
        mediaPermalink = parentEvent.media_permalink ?? null;
        mediaCaption = parentEvent.media_caption ?? null;
        mediaImageUrl = parentEvent.media_image_url ?? null;
      }
    }

    const insertEvent: Record<string, unknown> = {
      user_id: account.user_id,
      event_id: messageId ?? `reply_${Date.now()}`,
      event_type: isCommentReply ? "comment" : "message",
      ig_user_id: account.page_scoped_id ?? account.ig_user_id,
      sender_id: account.page_scoped_id ?? account.ig_user_id,
      sender_username: account.username ?? null,
      sender_name: null,
      sender_profile_url: null,
      media_id: mediaId,
      media_type: mediaType,
      media_permalink: mediaPermalink,
      media_caption: mediaCaption,
      media_image_url: mediaImageUrl,
      comment_id: isCommentReply ? (sendData?.id ?? null) : null,
      message_text: message_text,
      direction: "outgoing",
      recipient_id: isCommentReply ? null : recipient_id,
      reply_text: message_text,
      replied_at: new Date().toISOString(),
      raw_event: { sent_from_app: true, message_id: messageId, recipient_id, reply_type: isCommentReply ? "comment" : "dm" },
    };

    if (isCommentReply && parent_comment_id) {
      insertEvent.parent_comment_id = parent_comment_id;
    }

    await supabaseClient.from("instagram_webhook_events").insert(insertEvent);

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

    return new Response(JSON.stringify({ success: true, message_id: messageId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send reply error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
