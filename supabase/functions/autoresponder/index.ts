import { createClient } from "npm:@supabase/supabase-js@2.39.7";

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
  variables: string[] | null;
}

/**
 * Replaces all {{placeholder}} tokens in the given content with the provided values.
 * Any placeholder without a matching value is replaced with an empty string.
 */
function fillPlaceholders(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  // Remove any remaining unreplaced placeholders
  result = result.replace(/\{\{\w+\}\}/g, '');
  return result;
}

/**
 * Calls an AI model to generate text from a prompt.
 * Uses the OpenAI-compatible endpoint if an API key is configured, otherwise
 * returns a simple echo so the flow is testable without external deps.
 */
async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (apiKey) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI call failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  // Fallback: echo the prompt so the two-step flow is still testable
  console.log("OPENAI_API_KEY not set — returning echo fallback");
  return `[AI fallback] ${userPrompt.slice(0, 200)}`;
}

/**
 * Runs a prompt (single or two-step) and returns the final generated text.
 *
 * Placeholders available in both steps:
 *   {{business_data}}  — business/offer details from the prompt
 *   {{email}}          — the incoming email content
 *   {{conversation}}   — full conversation thread
 *
 * In two-step mode, Step 1 runs first and its full output is inserted
 * verbatim into Step 2 at the {{step1_result}} placeholder.
 */
async function runPrompt(
  prompt: PromptRow,
  context: {
    email: string;
    conversation: string;
    customVariables?: Record<string, string>;
  },
): Promise<string> {
  const businessData = prompt.use_business_data ? (prompt.business_data || '') : '';
  const baseVars: Record<string, string> = {
    business_data: businessData,
    email: context.email,
    conversation: context.conversation,
    ...context.customVariables,
  };

  if (prompt.reply_mode === 'two_step' && prompt.step1_content && prompt.step2_content) {
    // Step 1
    const step1Filled = fillPlaceholders(prompt.step1_content, baseVars);
    const step1Result = await callAI(
      "You are an AI assistant generating an intermediate result for an email autoresponder. Follow the output format specified in the prompt exactly.",
      step1Filled,
    );

    // Step 2 — inject step1_result verbatim
    const step2Vars = { ...baseVars, step1_result: step1Result };
    const step2Filled = fillPlaceholders(prompt.step2_content, step2Vars);
    const step2Result = await callAI(
      "You are an AI assistant writing a professional email reply. Use the provided intermediate result and business data to craft a polished response.",
      step2Filled,
    );

    return step2Result;
  }

  // Single step
  const filled = fillPlaceholders(prompt.content || '', baseVars);
  return callAI(
    "You are an AI assistant writing a professional email reply. Use the provided context to craft a polished response.",
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
    const { prompt_id, email_content, conversation, custom_variables, outbox_email_id } = body as {
      prompt_id?: string;
      email_content?: string;
      conversation?: string;
      custom_variables?: Record<string, string>;
      outbox_email_id?: string;
    };

    if (!prompt_id) {
      return new Response(
        JSON.stringify({ error: "Missing prompt_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load the prompt
    const { data: prompt, error: promptError } = await supabase
      .from("prompts")
      .select("id, title, content, reply_mode, step1_content, step2_content, business_data, use_business_data, variables")
      .eq("id", prompt_id)
      .maybeSingle() as { data: PromptRow | null; error: any };

    if (promptError || !prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const generatedReply = await runPrompt(prompt, {
      email: email_content || '',
      conversation: conversation || '',
      customVariables: custom_variables,
    });

    // If an outbox email id was provided, store the generated reply as a draft reply
    if (outbox_email_id) {
      const { data: outboxEmail } = await supabase
        .from("email_outbox")
        .select("to_email, from_email, subject, reply_to_id")
        .eq("id", outbox_email_id)
        .maybeSingle();

      if (outboxEmail) {
        const replySubject = outboxEmail.subject?.startsWith('Re: ')
          ? outboxEmail.subject
          : `Re: ${outboxEmail.subject || '(No Subject)'}`;

        await supabase.from("email_drafts").insert({
          to_email: outboxEmail.to_email,
          from_email: outboxEmail.from_email,
          subject: replySubject,
          body: generatedReply,
          reply_to_id: outboxEmail.reply_to_id || null,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, reply: generatedReply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Autoresponder error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
