import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReplaceVariablesRequest {
  template_id: string;
  user_id: string;
  variables: Record<string, string>;
}

function replacePlaceholders(content: string, variables: Record<string, string>): string {
  let result = content;
  
  for (const [placeholder, value] of Object.entries(variables)) {
    // Replace {{placeholder}} format
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { template_id, user_id, variables }: ReplaceVariablesRequest = await req.json();

    if (!template_id || !user_id || !variables) {
      throw new Error("Missing required parameters");
    }

    // Get template content
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("content, name, format")
      .eq("id", template_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (templateError || !template) {
      throw new Error(`Template not found: ${templateError?.message}`);
    }

    console.log(`Replacing variables in template: ${template.name}`);
    console.log(`Variables:`, variables);

    // Replace all placeholders
    const replacedContent = replacePlaceholders(template.content, variables);

    return new Response(
      JSON.stringify({
        success: true,
        content: replacedContent,
        format: template.format,
        name: template.name,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in replace-template-variables:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});