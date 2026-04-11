import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FieldInfo {
  name: string;
  label: string;
  importance: 'required' | 'important' | 'optional';
}

interface GenerateTemplateRequest {
  title: string;
  category: string;
  selectedFields: FieldInfo[];
  description: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const { title, category, selectedFields = [], description }: GenerateTemplateRequest = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: 'Title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!description || description.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Description is required for AI generation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

    const requiredFields = selectedFields.filter(f => f.importance === 'required');
    const importantFields = selectedFields.filter(f => f.importance === 'important');
    const optionalFields = selectedFields.filter(f => f.importance === 'optional');

    const fieldInstructions = [
      requiredFields.length > 0
        ? `REQUIRED fields (always include as {{fieldName}}): ${requiredFields.map(f => `{{${f.name}}} (${f.label})`).join(', ')}`
        : null,
      importantFields.length > 0
        ? `IMPORTANT fields (wrap in conditional: {{#if fieldName}}...{{/if}}): ${importantFields.map(f => `{{${f.name}}} (${f.label})`).join(', ')}`
        : null,
      optionalFields.length > 0
        ? `OPTIONAL fields (wrap in conditional: {{#if fieldName}}...{{/if}}): ${optionalFields.map(f => `{{${f.name}}} (${f.label})`).join(', ')}`
        : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are an expert email copywriter. You generate professional HTML email templates using a Handlebars-like template syntax.

TEMPLATE SYNTAX RULES:
- Required fields: use directly as {{fieldName}} — these are always available
- Important/Optional fields: wrap in conditionals like {{#if fieldName}}some text with {{fieldName}}{{/if}} — these may be missing
- Never invent field names. Only use the exact field names provided.

OUTPUT FORMAT:
- Return ONLY valid HTML suitable for an email body (no <html>, <head>, or <body> tags)
- Use inline styles for formatting
- Use a clean, professional design with proper paragraph spacing
- Do not include markdown, code blocks, or any explanation — just the raw HTML`;

    const userPrompt = `Generate an HTML email template with the following details:

Title: ${title}
Category: ${category}
Description: ${description}

Fields to use:
${fieldInstructions || 'No specific fields selected — write a general template.'}

Write a compelling, professional email that fulfills the description. Use the fields naturally within the copy. Return only the HTML body content.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const template = completion.choices[0]?.message?.content ?? '';

    return new Response(
      JSON.stringify({ template }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating template:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate template', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
