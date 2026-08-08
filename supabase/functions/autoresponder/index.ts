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
  variables: string[] | null;
  routing_addresses: string[] | null;
  routing_domains: string[] | null;
  user_id: string;
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
 * Calls OpenAI's gpt-4o model to generate text from a prompt.
 * Uses the npm:openai package and the OPENAI_API_KEY edge function secret,
 * matching the pattern in the generate-template edge function.
 */
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
    const { prompt_id, email_content, conversation, custom_variables, outbox_email_id, recipient_address } = body as {
      prompt_id?: string;
      email_content?: string;
      conversation?: string;
      custom_variables?: Record<string, string>;
      outbox_email_id?: string;
      recipient_address?: string;
    };

    // If a recipient_address is provided (incoming email destination), check
    // exemptions and auto-select a prompt by routing address/domain.
    let selectedPromptId = prompt_id;
    let resolvedUserId: string | undefined;

    if (recipient_address) {
      const lowerAddr = recipient_address.toLowerCase().trim();
      const domain = lowerAddr.split('@')[1] || '';

      // Look up the user who owns the receiving address (by matching domain)
      if (domain) {
        const { data: domainRow } = await supabase
          .from('amazon_ses_domains')
          .select('user_id, autoresponder_enabled')
          .ilike('domain', domain)
          .maybeSingle();

        if (domainRow && domainRow.autoresponder_enabled) {
          resolvedUserId = domainRow.user_id;

          // Check if the recipient address is exempt from auto-replying
          const { data: exempt } = await supabase
            .from('autoresponder_exemptions')
            .select('id')
            .eq('user_id', domainRow.user_id)
            .ilike('email_address', lowerAddr)
            .maybeSingle();

          if (exempt) {
            return new Response(
              JSON.stringify({ success: true, skipped: true, reason: 'Address is exempt from autoresponder' }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          // Auto-select a prompt: first by exact address, then by domain
          if (!selectedPromptId) {
            const { data: byAddr } = await supabase
              .from('prompts')
              .select('id, routing_addresses, routing_domains')
              .contains('routing_addresses', [lowerAddr])
              .maybeSingle();

            if (byAddr?.id) {
              selectedPromptId = byAddr.id;
            } else if (domain) {
              const { data: byDomain } = await supabase
                .from('prompts')
                .select('id, routing_addresses, routing_domains')
                .contains('routing_domains', [domain])
                .maybeSingle();
              if (byDomain?.id) {
                selectedPromptId = byDomain.id;
              }
            }
          }
        }
      }
    }

    if (!selectedPromptId) {
      return new Response(
        JSON.stringify({ error: "Missing prompt_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load the prompt
    const { data: prompt, error: promptError } = await supabase
      .from("prompts")
      .select("id, title, content, reply_mode, step1_content, step2_content, business_data, use_business_data, variables, routing_addresses, routing_domains, user_id")
      .eq("id", selectedPromptId)
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
