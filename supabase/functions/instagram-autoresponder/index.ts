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
  },
): Promise<string> {
  const businessData = prompt.use_business_data ? (prompt.business_data || '') : '';
  const baseVars: Record<string, string> = {
    business_data: businessData,
    message: context.message,
    conversation: context.conversation,
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
    "You are an AI assistant writing a reply to an Instagram direct message. Use the provided context to craft a polished, conversational response. Keep it friendly and appropriate for social media.",
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
    const { account_id, event_id } = body as {
      account_id?: string;
      event_id?: string;
    };

    if (!account_id || !event_id) {
      return new Response(
        JSON.stringify({ error: "Missing account_id or event_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch the incoming message event
    const { data: event, error: eventError } = await supabase
      .from("instagram_webhook_events")
      .select("id, sender_id, message_text, direction, event_type, created_at")
      .eq("id", event_id)
      .maybeSingle();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (event.direction !== "incoming" || event.event_type !== "message") {
      return new Response(
        JSON.stringify({ error: "Event is not an incoming DM" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!event.sender_id || !event.message_text) {
      return new Response(
        JSON.stringify({ error: "Missing sender_id or message_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch the account
    const { data: account, error: acctError } = await supabase
      .from("instagram_accounts")
      .select("id, user_id, access_token, ig_user_id, page_scoped_id, username, token_expired")
      .eq("id", account_id)
      .maybeSingle();

    if (acctError || !account) {
      return new Response(
        JSON.stringify({ error: "Account not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (account.token_expired || !account.access_token) {
      return new Response(
        JSON.stringify({ error: "Account token expired or missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch autoresponder settings for this account
    const { data: settings, error: settingsError } = await supabase
      .from("instagram_autoresponder_settings")
      .select("enabled, prompt_id, cooldown_minutes, last_replied_recipient, last_replied_at")
      .eq("account_id", account_id)
      .maybeSingle();

    if (settingsError || !settings || !settings.enabled) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Autoresponder not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!settings.prompt_id) {
      return new Response(
        JSON.stringify({ error: "No prompt configured for autoresponder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cooldown check: don't reply to the same recipient too frequently
    if (
      settings.last_replied_recipient === event.sender_id &&
      settings.last_replied_at
    ) {
      const minutesSinceLastReply =
        (Date.now() - new Date(settings.last_replied_at).getTime()) / 60000;
      if (minutesSinceLastReply < settings.cooldown_minutes) {
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: `Cooldown active (${Math.round(settings.cooldown_minutes - minutesSinceLastReply)} min remaining)`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 24-hour window check
    const hoursSinceMessage =
      (Date.now() - new Date(event.created_at).getTime()) / 3600000;
    if (hoursSinceMessage > 24) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "24-hour messaging window has closed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch recent conversation history for context
    const { data: recentEvents } = await supabase
      .from("instagram_webhook_events")
      .select("message_text, direction, created_at")
      .or(`sender_id.eq.${event.sender_id},recipient_id.eq.${event.sender_id}`)
      .eq("event_type", "message")
      .order("created_at", { ascending: true })
      .limit(20);

    const conversationText = (recentEvents || [])
      .map((e: any) => {
        const time = new Date(e.created_at).toLocaleString();
        const who = e.direction === "outgoing" ? "You" : "Them";
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
      return new Response(
        JSON.stringify({ error: "Prompt not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Generate the AI reply
    const generatedReply = await runPrompt(prompt, {
      message: event.message_text,
      conversation: conversationText,
    });

    // Send the reply via Instagram Graph API
    const isIgToken = account.access_token.startsWith("IGAA");
    const apiBase = isIgToken
      ? "https://graph.instagram.com"
      : "https://graph.facebook.com";
    const senderId = account.ig_user_id;
    const sendUrl = `${apiBase}/v21.0/${senderId}/messages`;

    const sendRes = await fetch(`${sendUrl}?access_token=${account.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: event.sender_id },
        message: { text: generatedReply },
      }),
    });

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      console.error("Instagram autoresponder send failed:", errBody);
      return new Response(
        JSON.stringify({ error: "Failed to send auto-reply", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sendData = await sendRes.json();
    const messageId = sendData?.message_id ?? null;

    // Store the outgoing auto-reply message
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
      recipient_id: event.sender_id,
      reply_text: generatedReply,
      replied_at: new Date().toISOString(),
      auto_replied: true,
      raw_event: { sent_from_autoresponder: true, message_id: messageId },
    });

    // Mark the incoming event as processed and auto-replied
    await supabase
      .from("instagram_webhook_events")
      .update({
        processed: true,
        auto_replied: true,
        reply_text: generatedReply,
        replied_at: new Date().toISOString(),
      })
      .eq("id", event_id);

    // Update cooldown tracking
    await supabase
      .from("instagram_autoresponder_settings")
      .update({
        last_replied_recipient: event.sender_id,
        last_replied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", account_id);

    return new Response(
      JSON.stringify({ success: true, reply: generatedReply, message_id: messageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Instagram autoresponder error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
