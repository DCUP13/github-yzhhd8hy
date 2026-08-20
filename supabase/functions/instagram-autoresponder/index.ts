import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import OpenAI from "npm:openai@4.28.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PromptRow {
  id: string;
  title: string;
  content: string | null;
  reply_mode: 'single' | 'two_step';
  step1_content: string | null;
  step2_content: string | null;
  business_data: string | null;
  use_business_data: boolean;
}

function fillPlaceholders(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  result = result.replace(/\{\{\w+\}\}/g, '');
  return result;
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  return raw.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
}

async function runPrompt(
  prompt: PromptRow,
  context: {
    message: string;
    conversation: string;
    senderUsername?: string;
  },
): Promise<string> {
  const businessData = prompt.use_business_data ? (prompt.business_data || '') : '';
  const baseVars: Record<string, string> = {
    business_data: businessData,
    message: context.message,
    conversation: context.conversation,
    sender_username: context.senderUsername || '',
  };

  if (prompt.reply_mode === 'two_step' && prompt.step1_content && prompt.step2_content) {
    const step1Filled = fillPlaceholders(prompt.step1_content, baseVars);
    const step1Result = await callAI(
      "You are an AI assistant generating an intermediate result for an Instagram DM autoresponder. Follow the output format specified in the prompt exactly.",
      step1Filled,
    );

    const step2Vars = { ...baseVars, step1_result: step1Result };
    const step2Filled = fillPlaceholders(prompt.step2_content, step2Vars);
    const step2Result = await callAI(
      "You are an AI assistant writing a reply to an Instagram direct message. Use the provided intermediate result and business data to craft a polished, conversational response. Keep it friendly and appropriate for social media.",
      step2Filled,
    );

    return step2Result;
  }

  const filled = fillPlaceholders(prompt.content || '', baseVars);
  return callAI(
    "You are an AI assistant writing a reply to an Instagram direct message. Use the provided context to craft a polished, conversational response. Keep it friendly and appropriate for social media. If the recent messages are just filler words (like 'hey', 'lol', 'ok', etc.) without a real question or topic, you may briefly acknowledge them without forcing a substantive response.",
    filled,
  );
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
    const { account_id, event_id, queue_id } = body as {
      account_id?: string;
      event_id?: string;
      queue_id?: string;
    };

    // Mode 1: Direct call from webhook for a single new message — just ensures a queue entry exists
    if (account_id && event_id && !queue_id) {
      const result = await ensureQueued(supabase, account_id, event_id);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mode 2: Queue processing — collect all pending messages for a conversation and respond
    if (queue_id) {
      const result = await processQueueItem(supabase, queue_id);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Missing account_id/event_id or queue_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Instagram autoresponder error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function ensureQueued(supabase: any, account_id: string, event_id: string): Promise<any> {
  // Fetch the incoming message event
  const { data: event, error: eventError } = await supabase
    .from("instagram_webhook_events")
    .select("id, sender_id, recipient_id, sender_username, message_text, direction, event_type, created_at, raw_event, processed")
    .eq("id", event_id)
    .maybeSingle();

  if (eventError || !event) return { error: "Event not found" };
  if (event.direction !== "incoming" || event.event_type !== "message")
    return { skipped: true, reason: "Not an incoming DM" };
  if (!event.sender_id || !event.message_text)
    return { skipped: true, reason: "Missing sender_id or message_text" };

  // Fetch autoresponder settings
  const { data: settings } = await supabase
    .from("instagram_autoresponder_settings")
    .select("enabled, prompt_id, response_delay_seconds")
    .eq("account_id", account_id)
    .maybeSingle();

  if (!settings || !settings.enabled)
    return { skipped: true, reason: "Autoresponder not enabled" };
  if (!settings.prompt_id)
    return { skipped: true, reason: "No prompt configured" };

  const isSelfMessage = (event as any).raw_event?.message?.is_self === true;
  const recipientId = isSelfMessage ? event.recipient_id : event.sender_id;

  // Check for an existing pending queue item for this conversation
  const { data: existing } = await supabase
    .from("instagram_response_queue")
    .select("id, fire_at")
    .eq("account_id", account_id)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .maybeSingle();

  const delaySeconds = settings.response_delay_seconds || 15;
  const fireAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

  let queueItemId: string;

  if (existing) {
    // Reset the timer — push fire_at forward so we wait for more messages
    await supabase
      .from("instagram_response_queue")
      .update({ fire_at: fireAt, trigger_event_id: event_id, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    queueItemId = existing.id;
  } else {
    // Create a new queue item
    const { data: queueItem, error: queueError } = await supabase
      .from("instagram_response_queue")
      .insert({
        account_id,
        user_id: event.user_id || (await supabase.from("instagram_webhook_events").select("user_id").eq("id", event_id).maybeSingle()).data?.user_id,
        recipient_id: recipientId,
        trigger_event_id: event_id,
        fire_at: fireAt,
        status: "pending",
      })
      .select("id")
      .single();

    if (queueError) return { error: "Failed to create queue item", details: queueError.message };
    queueItemId = queueItem.id;
  }

  // Wait for the delay to expire, polling to detect if a newer message reset the timer.
  // The webhook calls us fire-and-forget, so we can stay alive for the delay period.
  // Cap at 25s to avoid edge function timeout; for longer delays the cron (every 1 min) is the backup.
  const maxWaitMs = 25000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data: item } = await supabase
      .from("instagram_response_queue")
      .select("fire_at, status")
      .eq("id", queueItemId)
      .maybeSingle();

    if (!item || item.status !== "pending") {
      return { success: true, queued: true, queue_id: queueItemId, already_handled: true };
    }

    const fireAtMs = new Date(item.fire_at).getTime();
    const nowMs = Date.now();

    if (fireAtMs <= nowMs) {
      // Timer has fired — process the queue item now
      const result = await processQueueItem(supabase, queueItemId);
      return { success: true, queued: true, queue_id: queueItemId, processed: result };
    }

    // Sleep until fire_at or until we hit the max wait, in small increments
    const remainingToFire = fireAtMs - nowMs;
    const remainingToMax = maxWaitMs - (nowMs - startTime);
    const sleepMs = Math.min(remainingToFire, remainingToMax, 3000);
    if (sleepMs <= 0) break;
    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }

  // Ran out of time (delay > 25s) — the cron job will pick this up within a minute
  return { success: true, queued: true, queue_id: queueItemId, waiting_for_cron: true };
}

async function processQueueItem(supabase: any, queue_id: string): Promise<any> {
  // Claim the queue item
  const { data: queueItem, error: qError } = await supabase
    .from("instagram_response_queue")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", queue_id)
    .eq("status", "pending")
    .select("id, account_id, user_id, recipient_id, trigger_event_id, fire_at")
    .maybeSingle();

  if (qError || !queueItem) return { skipped: true, reason: "Queue item not found or already processing" };

  // Fetch account
  const { data: account, error: acctError } = await supabase
    .from("instagram_accounts")
    .select("id, user_id, access_token, ig_user_id, page_scoped_id, username, token_expired")
    .eq("id", queueItem.account_id)
    .maybeSingle();

  if (acctError || !account) {
    await markQueueFailed(supabase, queue_id, "Account not found");
    return { error: "Account not found" };
  }

  if (account.token_expired || !account.access_token) {
    await markQueueFailed(supabase, queue_id, "Account token expired");
    return { error: "Account token expired or missing" };
  }

  // Fetch settings
  const { data: settings } = await supabase
    .from("instagram_autoresponder_settings")
    .select("enabled, prompt_id")
    .eq("account_id", queueItem.account_id)
    .maybeSingle();

  if (!settings || !settings.enabled) {
    await completeQueue(supabase, queue_id);
    return { skipped: true, reason: "Autoresponder not enabled" };
  }

  if (!settings.prompt_id) {
    await markQueueFailed(supabase, queue_id, "No prompt configured");
    return { error: "No prompt configured" };
  }

  // Collect ALL unprocessed incoming messages for this conversation
  const recipientId = queueItem.recipient_id;
  const { data: pendingMessages, error: msgError } = await supabase
    .from("instagram_webhook_events")
    .select("id, sender_id, sender_username, message_text, created_at, raw_event")
    .eq("direction", "incoming")
    .eq("event_type", "message")
    .eq("processed", false)
    .or(`sender_id.eq.${recipientId},recipient_id.eq.${recipientId}`)
    .order("created_at", { ascending: true });

  if (msgError) {
    await markQueueFailed(supabase, queue_id, "Failed to fetch pending messages");
    return { error: "Failed to fetch pending messages" };
  }

  if (!pendingMessages || pendingMessages.length === 0) {
    await completeQueue(supabase, queue_id);
    return { skipped: true, reason: "No pending messages to respond to" };
  }

  // 24-hour window check on the oldest message
  const oldestMsg = pendingMessages[0];
  const hoursSinceMessage = (Date.now() - new Date(oldestMsg.created_at).getTime()) / 3600000;
  if (hoursSinceMessage > 24) {
    // Mark all as processed — too late to reply
    for (const msg of pendingMessages) {
      await supabase
        .from("instagram_webhook_events")
        .update({ processed: true })
        .eq("id", msg.id);
    }
    await completeQueue(supabase, queue_id);
    return { skipped: true, reason: "24-hour messaging window has closed" };
  }

  // Build the combined message text from all pending incoming messages
  const newMessagesText = pendingMessages
    .map((m: any, i: number) => {
      const isSelf = m.raw_event?.message?.is_self === true;
      const who = isSelf ? "Self" : (m.sender_username || "Them");
      return `[Message ${i + 1}] ${who}: ${m.message_text}`;
    })
    .join("\n");

  // Fetch recent conversation history (last 20 messages, including outgoing)
  const { data: recentEvents } = await supabase
    .from("instagram_webhook_events")
    .select("message_text, direction, created_at, sender_username, raw_event")
    .or(`sender_id.eq.${recipientId},recipient_id.eq.${recipientId}`)
    .eq("event_type", "message")
    .order("created_at", { ascending: true })
    .limit(20);

  const conversationText = (recentEvents || [])
    .map((e: any) => {
      const time = new Date(e.created_at).toLocaleString();
      const isSelf = e.raw_event?.message?.is_self === true;
      const who = e.direction === "outgoing"
        ? "You"
        : (isSelf ? "Self" : (e.sender_username || "Them"));
      return `[${time}] ${who}: ${e.message_text ?? ""}`;
    })
    .join("\n");

  // Load the prompt
  const { data: prompt, error: promptError } = await supabase
    .from("prompts")
    .select("id, title, content, reply_mode, step1_content, step2_content, business_data, use_business_data")
    .eq("id", settings.prompt_id)
    .maybeSingle() as { data: PromptRow | null; error: any };

  if (promptError || !prompt) {
    await markQueueFailed(supabase, queue_id, "Prompt not found");
    return { error: "Prompt not found" };
  }

  // Generate the AI reply with all pending messages as context
  const generatedReply = await runPrompt(prompt, {
    message: newMessagesText,
    conversation: conversationText,
    senderUsername: pendingMessages[0]?.sender_username || '',
  });

  // Send the reply via Instagram Graph API
  const isIgToken = account.access_token.startsWith("IGAA");
  const apiBase = isIgToken
    ? "https://graph.instagram.com"
    : "https://graph.facebook.com";
  const sendUrl = `${apiBase}/v21.0/${account.ig_user_id}/messages`;

  const sendRes = await fetch(`${sendUrl}?access_token=${account.access_token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: generatedReply },
    }),
  });

  if (!sendRes.ok) {
    const errBody = await sendRes.text();
    console.error("Instagram autoresponder send failed:", errBody);
    await markQueueFailed(supabase, queue_id, `Send failed: ${errBody}`);
    return { error: "Failed to send auto-reply", details: errBody };
  }

  const sendData = await sendRes.json();
  const messageId = sendData?.message_id ?? null;

  // Store the outgoing auto-reply
  await supabase.from("instagram_webhook_events").insert({
    user_id: account.user_id,
    event_id: messageId ?? `auto_${Date.now()}`,
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
    message_text: generatedReply,
    direction: "outgoing",
    recipient_id: recipientId,
    reply_text: generatedReply,
    replied_at: new Date().toISOString(),
    auto_replied: true,
    raw_event: { sent_from_autoresponder: true, message_id: messageId, replied_to_count: pendingMessages.length },
  });

  // Mark ALL pending incoming messages as processed
  const messageIds = pendingMessages.map((m: any) => m.id);
  await supabase
    .from("instagram_webhook_events")
    .update({
      processed: true,
      auto_replied: true,
      reply_text: generatedReply,
      replied_at: new Date().toISOString(),
    })
    .in("id", messageIds);

  await completeQueue(supabase, queue_id);

  return {
    success: true,
    reply: generatedReply,
    message_id: messageId,
    messages_combined: pendingMessages.length,
  };
}

async function markQueueFailed(supabase: any, queue_id: string, reason: string) {
  await supabase
    .from("instagram_response_queue")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", queue_id);
}

async function completeQueue(supabase: any, queue_id: string) {
  await supabase
    .from("instagram_response_queue")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", queue_id);
}
