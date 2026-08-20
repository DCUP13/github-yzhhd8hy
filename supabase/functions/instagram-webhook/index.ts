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

            // Process auto rules for this comment
            if (userId && account && value?.text && value?.from?.id) {
              await processAutoRules(supabaseClient, {
                userId,
                accountId: account.id,
                senderId: value.from.id,
                senderUsername: value.from.username ?? null,
                commentText: value.text,
                mediaId: mediaId,
                commentId: value.id ?? null,
                accessToken: account.access_token,
                igUserId: account.ig_user_id,
                pageScopedId: account.page_scoped_id,
                username: account.username,
              });
            }
          }
        }

        const messaging: any[] = entry?.messaging ?? [];
        for (const msg of messaging) {
          if (msg.read || msg.delivery || msg.reaction || msg.message_edit) continue;
          const messageText = msg?.message?.text ?? null;
          if (!messageText && !msg?.message?.attachment) continue;
          const isEcho = msg?.message?.is_echo === true;
          const isSelfMessage = msg?.message?.is_self === true;
          const senderId = msg?.sender?.id ?? null;
          const recipientId = msg?.recipient?.id ?? null;
          const otherPartyId = isEcho ? recipientId : senderId;

          const storedEventId = await storeEvent(supabaseClient, {
            event_id: msg?.message?.mid ?? null, event_type: "message", ig_user_id: igUserId,
            sender_id: senderId, sender_username: null, sender_name: null, sender_profile_url: null,
            media_id: null, media_type: null, media_permalink: null, media_caption: null,
            comment_id: null, message_text: messageText,
            direction: isSelfMessage ? "incoming" : (isEcho ? "outgoing" : "incoming"), recipient_id: recipientId,
            raw_event: msg, user_id: userId,
          }, accessToken, otherPartyId, true);

          // Process conversation flow replies for incoming DMs.
          // Self-messages (DMing yourself) are also processed so you can test
          // flows from your own account. Echo-only messages (outgoing to others)
          // are still skipped.
          const shouldProcessFlow = userId && account && senderId && messageText && storedEventId
            && (!isEcho || isSelfMessage);
          if (shouldProcessFlow) {
            await processFlowReply(supabaseClient, {
              userId,
              accountId: account.id,
              senderId,
              messageText,
              eventId: storedEventId,
              accessToken: account.access_token,
              igUserId: account.ig_user_id,
              pageScopedId: account.page_scoped_id,
              username: account.username,
              isSelfMessage,
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
): Promise<{ id: string; user_id: string; access_token: string | null; page_scoped_id: string | null; ig_user_id: string | null; username: string | null } | null> {
  if (!igUserId) return null;

  const { data: exact } = await supabaseClient
    .from("instagram_accounts")
    .select("id, user_id, access_token, page_scoped_id, ig_user_id, username")
    .eq("ig_user_id", igUserId)
    .maybeSingle();
  if (exact) return exact;

  const { data: byPageId } = await supabaseClient
    .from("instagram_accounts")
    .select("id, user_id, access_token, page_scoped_id, ig_user_id, username")
    .eq("page_scoped_id", igUserId)
    .maybeSingle();
  if (byPageId) return byPageId;

  const { data: allAccounts } = await supabaseClient
    .from("instagram_accounts")
    .select("id, user_id, access_token, page_scoped_id, ig_user_id, username");
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

/**
 * Send a DM via the Instagram Graph API.
 * Supports text, link, and media attachment.
 */
async function sendInstagramDM(
  accessToken: string,
  igUserId: string,
  recipientId: string,
  options: { text?: string; linkUrl?: string; mediaUrl?: string; mediaType?: string },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const isIgToken = accessToken.startsWith("IGAA");
  const apiBase = isIgToken ? "https://graph.instagram.com" : "https://graph.facebook.com";
  const sendUrl = `${apiBase}/v21.0/${igUserId}/messages`;

  const messageBody: any = {};
  if (options.text) messageBody.text = options.text;

  // If a link is provided, append it to the text or send as a separate message
  if (options.linkUrl) {
    if (messageBody.text) {
      messageBody.text = `${messageBody.text}\n${options.linkUrl}`;
    } else {
      messageBody.text = options.linkUrl;
    }
  }

  // Send text message first if we have text
  let lastMessageId: string | null = null;
  if (messageBody.text) {
    const sendRes = await fetch(`${sendUrl}?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: messageBody.text },
      }),
    });
    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      console.error("Instagram DM send failed:", errBody);
      return { success: false, error: errBody };
    }
    const sendData = await sendRes.json();
    lastMessageId = sendData?.message_id ?? null;
  }

  // Send media attachment if provided
  if (options.mediaUrl) {
    const attachmentType = options.mediaType === "image" ? "image" : "file";
    const attachmentPayload: any = { url: options.mediaUrl };
    if (options.mediaType === "image") {
      attachmentPayload.is_reusable = true;
    }

    const mediaRes = await fetch(`${sendUrl}?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { attachment: { type: attachmentType, payload: attachmentPayload } },
      }),
    });
    if (!mediaRes.ok) {
      const errBody = await mediaRes.text();
      console.error("Instagram media send failed:", errBody);
      // Don't fail entirely if text already went through
      if (!lastMessageId) return { success: false, error: errBody };
    } else {
      const mediaData = await mediaRes.json();
      lastMessageId = mediaData?.message_id ?? lastMessageId;
    }
  }

  return { success: true, messageId: lastMessageId ?? undefined };
}

/**
 * Send a public comment reply via the Instagram Graph API.
 */
async function sendCommentReply(
  accessToken: string,
  commentId: string,
  replyText: string,
): Promise<{ success: boolean; error?: string }> {
  const isIgToken = accessToken.startsWith("IGAA");
  const apiBase = isIgToken ? "https://graph.instagram.com" : "https://graph.facebook.com";
  const url = `${apiBase}/v21.0/${commentId}/replies?access_token=${accessToken}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: replyText }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error("Comment reply failed:", errBody);
    return { success: false, error: errBody };
  }
  return { success: true };
}

interface AutoRuleContext {
  userId: string;
  accountId: string;
  senderId: string;
  senderUsername: string | null;
  commentText: string;
  mediaId: string | null;
  commentId: string | null;
  accessToken: string | null;
  igUserId: string | null;
  pageScopedId: string | null;
  username: string | null;
}

/**
 * Check active auto rules when a comment comes in.
 * If a rule's keyword matches the comment text, perform the configured action:
 * - 'comment': post a public comment reply
 * - 'dm': send a private DM
 * - 'both': do both
 * Also checks conversation flow triggers.
 */
async function processAutoRules(supabaseClient: any, ctx: AutoRuleContext) {
  if (!ctx.accessToken) return;

  // Fetch active rules for this user
  const { data: rules } = await supabaseClient
    .from("instagram_auto_rules")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("active", true);

  if (!rules || rules.length === 0) {
    // Still check for conversation flow triggers
    await checkFlowTriggers(supabaseClient, ctx);
    return;
  }

  const commentTextLower = ctx.commentText.toLowerCase();

  for (const rule of rules) {
    const keyword = (rule.trigger_keyword || "").toLowerCase().trim();
    if (!keyword) continue;

    // Check if keyword matches (contains match, case-insensitive)
    if (!commentTextLower.includes(keyword)) continue;

    // If rule is scoped to a specific media_id, check it matches
    if (rule.media_id && ctx.mediaId && rule.media_id !== ctx.mediaId) continue;

    // --- DM action ---
    if ((rule.action_type === "dm" || rule.action_type === "both") && ctx.igUserId) {
      // Check send_once_per_user
      if (rule.send_once_per_user) {
        const { data: existingDm } = await supabaseClient
          .from("instagram_rule_dm_log")
          .select("id")
          .eq("rule_id", rule.id)
          .eq("sender_id", ctx.senderId)
          .maybeSingle();
        if (existingDm) continue; // Already DMed this person for this rule
      }

      const dmText = rule.dm_message || rule.reply_text;
      if (dmText) {
        const senderIdForDm = ctx.pageScopedId || ctx.igUserId;
        const result = await sendInstagramDM(
          ctx.accessToken,
          senderIdForDm!,
          ctx.senderId,
          {
            text: dmText,
            linkUrl: rule.link_url || undefined,
            mediaUrl: rule.media_url || undefined,
            mediaType: rule.media_type || undefined,
          },
        );

        if (result.success) {
          // Log the DM
          await supabaseClient.from("instagram_rule_dm_log").insert({
            rule_id: rule.id,
            user_id: ctx.userId,
            sender_id: ctx.senderId,
            sender_username: ctx.senderUsername,
            media_id: ctx.mediaId,
            comment_id: ctx.commentId,
          });

          // Store outgoing DM event
          await supabaseClient.from("instagram_webhook_events").insert({
            user_id: ctx.userId,
            event_id: result.messageId ?? `dm_${Date.now()}`,
            event_type: "message",
            ig_user_id: ctx.pageScopedId ?? ctx.igUserId,
            sender_id: ctx.pageScopedId ?? ctx.igUserId,
            sender_username: ctx.username ?? null,
            message_text: dmText,
            direction: "outgoing",
            recipient_id: ctx.senderId,
            reply_text: dmText,
            replied_at: new Date().toISOString(),
            auto_replied: true,
            raw_event: { sent_from_auto_rule: true, rule_id: rule.id, message_id: result.messageId },
          });
        }
      }
    }

    // --- Comment reply action ---
    if ((rule.action_type === "comment" || rule.action_type === "both") && ctx.commentId) {
      let replyText = rule.reply_text;
      if (rule.link_url) {
        replyText = `${replyText}\n${rule.link_url}`;
      }
      await sendCommentReply(ctx.accessToken, ctx.commentId, replyText);
    }
  }

  // Check conversation flow triggers
  await checkFlowTriggers(supabaseClient, ctx);
}

/**
 * Check if any conversation flow should be triggered by this comment.
 */
async function checkFlowTriggers(supabaseClient: any, ctx: AutoRuleContext) {
  if (!ctx.accessToken || !ctx.igUserId) return;

  const { data: flows } = await supabaseClient
    .from("instagram_conversation_flows")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("account_id", ctx.accountId)
    .eq("active", true)
    .eq("trigger_type", "comment_keyword");

  if (!flows || flows.length === 0) return;

  const commentTextLower = ctx.commentText.toLowerCase();

  for (const flow of flows) {
    const keyword = (flow.trigger_keyword || "").toLowerCase().trim();
    if (!keyword) continue;
    if (!commentTextLower.includes(keyword)) continue;

    // If flow is scoped to a specific media post
    if (flow.trigger_media_id && ctx.mediaId && flow.trigger_media_id !== ctx.mediaId) continue;

    // Check if this person already has an active session for this flow
    const { data: existingSession } = await supabaseClient
      .from("instagram_flow_sessions")
      .select("id, status")
      .eq("flow_id", flow.id)
      .eq("sender_id", ctx.senderId)
      .in("status", ["active", "waiting_reply"])
      .maybeSingle();

    if (existingSession) continue; // Already in this flow

    // Start the flow
    await startFlowSession(supabaseClient, {
      flowId: flow.id,
      userId: ctx.userId,
      accountId: ctx.accountId,
      senderId: ctx.senderId,
      senderUsername: ctx.senderUsername,
      firstStepId: flow.first_step_id,
      accessToken: ctx.accessToken,
      igUserId: ctx.igUserId,
      pageScopedId: ctx.pageScopedId,
      username: ctx.username,
    });
  }
}

interface FlowStartContext {
  flowId: string;
  userId: string;
  accountId: string;
  senderId: string;
  senderUsername: string | null;
  firstStepId: string | null;
  accessToken: string;
  igUserId: string | null;
  pageScopedId: string | null;
  username: string | null;
}

/**
 * Create a flow session and execute the first step.
 */
async function startFlowSession(supabaseClient: any, ctx: FlowStartContext) {
  // Create the session
  const { data: session, error } = await supabaseClient
    .from("instagram_flow_sessions")
    .insert({
      flow_id: ctx.flowId,
      user_id: ctx.userId,
      account_id: ctx.accountId,
      sender_id: ctx.senderId,
      sender_username: ctx.senderUsername,
      current_step_id: ctx.firstStepId,
      status: "active",
      window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      last_interacted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !session) {
    console.error("Failed to create flow session:", error);
    return;
  }

  console.log("startFlowSession: session created:", session.id, "firstStepId:", ctx.firstStepId);

  // Resolve the first step — use firstStepId from the flow, or fall back to the
  // lowest-order step if it was never set (safety net for older flows).
  let stepIdToExecute = ctx.firstStepId;
  if (!stepIdToExecute) {
    const { data: firstStep } = await supabaseClient
      .from("instagram_flow_steps")
      .select("id")
      .eq("flow_id", ctx.flowId)
      .order("step_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    stepIdToExecute = firstStep?.id ?? null;
    if (stepIdToExecute) {
      await supabaseClient
        .from("instagram_flow_sessions")
        .update({ current_step_id: stepIdToExecute })
        .eq("id", session.id);
      // Also repair the flow's first_step_id so future sessions don't need this fallback
      await supabaseClient
        .from("instagram_conversation_flows")
        .update({ first_step_id: stepIdToExecute })
        .eq("id", ctx.flowId);
    }
  }

  if (stepIdToExecute) {
    await executeFlowStep(supabaseClient, {
      sessionId: session.id,
      stepId: stepIdToExecute,
      accessToken: ctx.accessToken,
      igUserId: ctx.igUserId,
      pageScopedId: ctx.pageScopedId,
      senderId: ctx.senderId,
      userId: ctx.userId,
    });
  }
}

interface FlowStepContext {
  sessionId: string;
  stepId: string;
  accessToken: string;
  igUserId: string | null;
  pageScopedId: string | null;
  senderId: string;
  userId: string;
}

/**
 * Execute a single flow step: send the message, then advance or wait for reply.
 */
async function executeFlowStep(supabaseClient: any, ctx: FlowStepContext) {
  const { data: step } = await supabaseClient
    .from("instagram_flow_steps")
    .select("*")
    .eq("id", ctx.stepId)
    .maybeSingle();

  if (!step) {
    // Step doesn't exist — mark session completed
    await supabaseClient
      .from("instagram_flow_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", ctx.sessionId);
    return;
  }

  const senderIdForDm = ctx.pageScopedId || ctx.igUserId;
  if (!senderIdForDm) return;

  // Send the step's message
  if (step.message_text || step.link_url || step.media_url) {
    const result = await sendInstagramDM(
      ctx.accessToken,
      senderIdForDm,
      ctx.senderId,
      {
        text: step.message_text || undefined,
        linkUrl: step.link_url || undefined,
        mediaUrl: step.media_url || undefined,
        mediaType: step.media_type || undefined,
      },
    );

    if (result.success) {
      // Store outgoing message event
      await supabaseClient.from("instagram_webhook_events").insert({
        user_id: ctx.userId,
        event_id: result.messageId ?? `flow_${ctx.sessionId}_${Date.now()}`,
        event_type: "message",
        ig_user_id: ctx.pageScopedId ?? ctx.igUserId,
        sender_id: ctx.pageScopedId ?? ctx.igUserId,
        message_text: step.message_text || "",
        direction: "outgoing",
        recipient_id: ctx.senderId,
        reply_text: step.message_text || "",
        replied_at: new Date().toISOString(),
        auto_replied: true,
        flow_session_id: ctx.sessionId,
        raw_event: { sent_from_flow: true, step_id: ctx.stepId, message_id: result.messageId },
      });
    } else if (ctx.senderId === senderIdForDm) {
      // Self-message test: Instagram API rejects sending a DM to yourself.
      // Store the message as a simulated outgoing event so the flow is visible.
      console.log("executeFlowStep: self-message send failed, storing simulated outgoing message");
      await supabaseClient.from("instagram_webhook_events").insert({
        user_id: ctx.userId,
        event_id: `flow_${ctx.sessionId}_${Date.now()}`,
        event_type: "message",
        ig_user_id: ctx.pageScopedId ?? ctx.igUserId,
        sender_id: ctx.pageScopedId ?? ctx.igUserId,
        message_text: step.message_text || "",
        direction: "outgoing",
        recipient_id: ctx.senderId,
        reply_text: step.message_text || "",
        replied_at: new Date().toISOString(),
        auto_replied: true,
        flow_session_id: ctx.sessionId,
        raw_event: { sent_from_flow: true, step_id: ctx.stepId, simulated_self_message: true, send_error: result.error },
      });
    } else {
      console.error("executeFlowStep: DM send failed:", result.error);
    }
  }

  // Determine next state
  if (step.wait_for_reply) {
    // Update session to wait for reply
    await supabaseClient
      .from("instagram_flow_sessions")
      .update({
        current_step_id: ctx.stepId,
        status: "waiting_reply",
        last_interacted_at: new Date().toISOString(),
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", ctx.sessionId);
  } else {
    // No wait — advance to next step immediately
    if (step.next_step_id) {
      await supabaseClient
        .from("instagram_flow_sessions")
        .update({
          current_step_id: step.next_step_id,
          status: "active",
          last_interacted_at: new Date().toISOString(),
        })
        .eq("id", ctx.sessionId);
      // Execute the next step
      await executeFlowStep(supabaseClient, { ...ctx, stepId: step.next_step_id });
    } else {
      // No next step — flow is complete
      await supabaseClient
        .from("instagram_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", ctx.sessionId);
    }
  }
}

interface FlowReplyContext {
  userId: string;
  accountId: string;
  senderId: string;
  messageText: string;
  eventId: string;
  accessToken: string | null;
  igUserId: string | null;
  pageScopedId: string | null;
  username: string | null;
  isSelfMessage: boolean;
}

/**
 * When a DM comes in, check if the sender is in a waiting_reply flow session.
 * If so, process the reply according to the current step's branch type.
 */
async function processFlowReply(supabaseClient: any, ctx: FlowReplyContext) {
  console.log("processFlowReply called:", { userId: ctx.userId, senderId: ctx.senderId, messageText: ctx.messageText, accountId: ctx.accountId, hasToken: !!ctx.accessToken, igUserId: ctx.igUserId, pageScopedId: ctx.pageScopedId, isSelfMessage: ctx.isSelfMessage });

  // Prevent infinite loops: if this is a self-message, check if we recently sent
  // a flow step message with the same text. If so, skip — this is our own outgoing
  // message coming back as an echo.
  if (ctx.isSelfMessage) {
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    const { data: recentOutgoing } = await supabaseClient
      .from("instagram_webhook_events")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("direction", "outgoing")
      .eq("message_text", ctx.messageText)
      .gte("created_at", fiveSecondsAgo)
      .limit(1);
    if (recentOutgoing && recentOutgoing.length > 0) {
      console.log("processFlowReply: skipping self-message — matches recent outgoing flow message");
      return;
    }
  }

  // Find active or waiting sessions for this sender across all flows owned by this user
  const { data: sessions } = await supabaseClient
    .from("instagram_flow_sessions")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("sender_id", ctx.senderId)
    .in("status", ["waiting_reply", "active"]);

  console.log("processFlowReply: sessions found:", sessions?.length ?? 0);

  if (!sessions || sessions.length === 0) {
    // Check for DM-triggered flows
    if (ctx.accessToken && ctx.igUserId) {
      const { data: flows } = await supabaseClient
        .from("instagram_conversation_flows")
        .select("*")
        .eq("user_id", ctx.userId)
        .eq("account_id", ctx.accountId)
        .eq("active", true)
        .eq("trigger_type", "dm_keyword");

      if (flows && flows.length > 0) {
        const msgLower = ctx.messageText.toLowerCase();
        for (const flow of flows) {
          const keyword = (flow.trigger_keyword || "").toLowerCase().trim();
          console.log("processFlowReply: checking flow:", flow.id, "keyword:", keyword, "match:", msgLower.includes(keyword));
          if (!keyword) continue;
          if (!msgLower.includes(keyword)) continue;

          // Check no existing active session
          const { data: existing } = await supabaseClient
            .from("instagram_flow_sessions")
            .select("id, status")
            .eq("flow_id", flow.id)
            .eq("sender_id", ctx.senderId)
            .in("status", ["active", "waiting_reply"])
            .maybeSingle();
          if (existing) continue;

          console.log("processFlowReply: starting flow session for flow:", flow.id, "firstStepId:", flow.first_step_id);
          await startFlowSession(supabaseClient, {
            flowId: flow.id,
            userId: ctx.userId,
            accountId: ctx.accountId,
            senderId: ctx.senderId,
            senderUsername: null,
            firstStepId: flow.first_step_id,
            accessToken: ctx.accessToken,
            igUserId: ctx.igUserId,
            pageScopedId: ctx.pageScopedId,
            username: ctx.username,
          });
        }
      }
    }
    return;
  }

  if (!ctx.accessToken) return;

  for (const session of sessions) {
    // Recover sessions that are "active" but have no current_step_id (can happen
    // when first_step_id was null at creation time). Try to find and execute the
    // first step for the flow.
    if (session.status === "active" && !session.current_step_id) {
      const { data: firstStep } = await supabaseClient
        .from("instagram_flow_steps")
        .select("id")
        .eq("flow_id", session.flow_id)
        .order("step_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstStep) {
        await supabaseClient
          .from("instagram_flow_sessions")
          .update({ current_step_id: firstStep.id })
          .eq("id", session.id);
        await executeFlowStep(supabaseClient, {
          sessionId: session.id,
          stepId: firstStep.id,
          accessToken: ctx.accessToken,
          igUserId: ctx.igUserId,
          pageScopedId: ctx.pageScopedId,
          senderId: ctx.senderId,
          userId: ctx.userId,
        });
      }
      continue;
    }

    // If the session is active with a valid current_step_id, the step's message
    // may not have been sent yet (e.g. first_step_id was null when the session
    // was created). Execute it now.
    if (session.status === "active" && session.current_step_id) {
      await executeFlowStep(supabaseClient, {
        sessionId: session.id,
        stepId: session.current_step_id,
        accessToken: ctx.accessToken,
        igUserId: ctx.igUserId,
        pageScopedId: ctx.pageScopedId,
        senderId: ctx.senderId,
        userId: ctx.userId,
      });
      continue;
    }

    if (session.status !== "waiting_reply") continue;

    // Check 24h window
    if (session.window_expires_at && new Date(session.window_expires_at) < new Date()) {
      await supabaseClient
        .from("instagram_flow_sessions")
        .update({ status: "expired" })
        .eq("id", session.id);
      continue;
    }

    // Get the current step
    const { data: step } = await supabaseClient
      .from("instagram_flow_steps")
      .select("*")
      .eq("id", session.current_step_id)
      .maybeSingle();

    if (!step) {
      await supabaseClient
        .from("instagram_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session.id);
      continue;
    }

    // Link the incoming event to this flow session
    await supabaseClient
      .from("instagram_webhook_events")
      .update({ flow_session_id: session.id })
      .eq("id", ctx.eventId);

    // Determine next step based on branch type
    let nextStepId: string | null = null;

    if (step.branch_type === "keyword" && step.branch_conditions) {
      const conditions = Array.isArray(step.branch_conditions) ? step.branch_conditions : [];
      const replyLower = ctx.messageText.toLowerCase();
      for (const cond of conditions) {
        const condKeyword = (cond.keyword || "").toLowerCase().trim();
        if (condKeyword && replyLower.includes(condKeyword)) {
          nextStepId = cond.next_step_id ?? null;
          break;
        }
      }
      // If no branch matched, fall through to default next_step_id
      if (!nextStepId) {
        nextStepId = step.next_step_id ?? null;
      }
    } else if (step.branch_type === "any_reply") {
      nextStepId = step.next_step_id ?? null;
    } else {
      nextStepId = step.next_step_id ?? null;
    }

    // Advance the session
    if (nextStepId) {
      await supabaseClient
        .from("instagram_flow_sessions")
        .update({
          current_step_id: nextStepId,
          status: "active",
          last_interacted_at: new Date().toISOString(),
          window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", session.id);

      await executeFlowStep(supabaseClient, {
        sessionId: session.id,
        stepId: nextStepId,
        accessToken: ctx.accessToken,
        igUserId: ctx.igUserId,
        pageScopedId: ctx.pageScopedId,
        senderId: ctx.senderId,
        userId: ctx.userId,
      });
    } else {
      // No next step — flow complete
      await supabaseClient
        .from("instagram_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session.id);
    }
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
  returnId: boolean = false,
): Promise<string | null> {
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
    if (existing) return returnId ? existing.id : null;
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

  const insertData: any = {
    user_id: userId, event_id: event.event_id, event_type: event.event_type,
    ig_user_id: event.ig_user_id, sender_id: event.sender_id,
    sender_username: senderUsername, sender_name: senderName, sender_profile_url: senderProfileUrl,
    media_id: event.media_id, media_type: event.media_type,
    media_permalink: event.media_permalink, media_caption: event.media_caption,
    comment_id: event.comment_id, message_text: event.message_text,
    direction: event.direction, recipient_id: event.recipient_id,
    raw_event: event.raw_event,
  };

  let storedId: string | null = null;
  if (returnId) {
    const { data: inserted } = await supabaseClient
      .from("instagram_webhook_events")
      .insert(insertData)
      .select("id")
      .maybeSingle();
    storedId = inserted?.id ?? null;
  } else {
    await supabaseClient.from("instagram_webhook_events").insert(insertData);
  }

  // Trigger the Instagram autoresponder for incoming DMs
  if (
    event.direction === "incoming" &&
    event.event_type === "message" &&
    event.message_text &&
    userId
  ) {
    const { data: acct } = await supabaseClient
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (acct?.id) {
      const { data: arSettings } = await supabaseClient
        .from("instagram_autoresponder_settings")
        .select("enabled")
        .eq("account_id", acct.id)
        .maybeSingle();

      if (arSettings?.enabled) {
        const eventIdToUse = storedId;
        if (eventIdToUse) {
          // Check if this sender is in an active flow session — if so, don't trigger AI autoresponder
          const { data: flowSession } = await supabaseClient
            .from("instagram_flow_sessions")
            .select("id")
            .eq("user_id", userId)
            .eq("sender_id", event.sender_id ?? "")
            .in("status", ["active", "waiting_reply"])
            .maybeSingle();

          if (!flowSession) {
            const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
            fetch(`${supabaseUrl}/functions/v1/instagram-autoresponder`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ account_id: acct.id, event_id: eventIdToUse }),
            }).catch((err) => console.error("Autoresponder queue error:", err));
          }
        }
      }
    }
  }

  return storedId;
}
