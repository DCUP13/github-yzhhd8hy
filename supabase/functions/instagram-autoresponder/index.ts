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
  user_id: string;
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
    max_tokens: 1000,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  return raw.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
}

async function runPrompt(
  prompt: PromptRow,
  context: {
    message: string;
    conversation: string;
    senderName: string;
  },
): Promise<string> {
  const businessData = prompt.use_business_data ? (prompt.business_data || '') : '';
  const baseVars: Record<string, string> = {
    business_data: businessData,
    message: context.message,
    conversation: context.conversation,
    sender_name: context.senderName,
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
      "You are an AI assistant writing a reply to an Instagram direct message. Use the provided intermediate result and business data to craft a polished, friendly response. Keep it concise and natural for social media.",
      step2Filled,
    );

    return step2Result;
  }

  const filled = fillPlaceholders(prompt.content || '', baseVars);
  return callAI(
    "You are an AI assistant writing a reply to an Instagram direct message. Use the provided context to craft a polished, friendly response. Keep it concise and natural for social media.",
    filled,
  );
}

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
    const { event_id, account_id, sender_id, message_text, conversation_history, sender_name } = body as {
      event_id?: string;
      account_id?: string;
      sender_id?: string;
      message_text?: string;
      conversation_history?: string;
      sender_name?: string;
    };

    if (!account_id || !sender_id || !message_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: account_id, sender_id, message_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load autoresponder settings for this account
    const { data: settings, error: settingsError } = await supabase
      .from("instagram_autoresponder_settings")
      .select("*")
      .eq("account_id", account_id)
      .maybeSingle();

    if (settingsError || !settings || !settings.enabled) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Autoresponder not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check cooldown — don't reply to the same recipient too frequently
    if (settings.last_replied_recipient === sender_id && settings.last_replied_at) {
      const elapsed = (Date.now() - new Date(settings.last_replied_at).getTime()) / 60000;
      if (elapsed < settings.cooldown_minutes) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: `Cooldown active (${Math.round(settings.cooldown_minutes - elapsed)} min remaining)` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Load the prompt
    const { data: prompt, error: promptError } = await supabase
      .from("prompts")
      .select("id, title, content, reply_mode, step1_content, step2_content, business_data, use_business_data, user_id")
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
      message: message_text,
      conversation: conversation_history || '',
      senderName: sender_name || 'Someone',
    });

    // Fetch the account's access token to send the reply
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("access_token, page_scoped_id")
      .eq("id", account_id)
      .maybeSingle();

    if (!account?.access_token) {
      return new Response(
        JSON.stringify({ error: "No access token for account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send the reply via Instagram API
    const apiBase = getApiBase(account.access_token);
    const sendUrl = `${apiBase}/v21.0/${account.page_scoped_id}/messages?access_token=${account.access_token}`;

    const sendResponse = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: sender_id },
        message: { text: generatedReply },
      }),
    });

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      console.error("Instagram send error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send Instagram reply", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sendData = await sendResponse.json();

    // Store the outgoing message in webhook events
    await supabase.from("instagram_webhook_events").insert({
      event_id: sendData?.message_id ?? `auto_${Date.now()}`,
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
      message_text: generatedReply,
      direction: "outgoing",
      recipient_id: sender_id,
      raw_event: { auto_reply: true, generated_by: "instagram-autoresponder" },
      auto_replied: false,
    });

    // Mark the original incoming event as auto-replied
    if (event_id) {
      await supabase
        .from("instagram_webhook_events")
        .update({ auto_replied: true })
        .eq("id", event_id);
    }

    // Update cooldown tracker
    await supabase
      .from("instagram_autoresponder_settings")
      .update({
        last_replied_recipient: sender_id,
        last_replied_at: new Date().toISOString(),
      })
      .eq("id", settings.id);

    return new Response(
      JSON.stringify({ success: true, reply: generatedReply, message_id: sendData?.message_id }),
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
