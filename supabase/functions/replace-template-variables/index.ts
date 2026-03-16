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
  contact_id?: string;
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

    const { template_id, user_id, variables, contact_id }: ReplaceVariablesRequest = await req.json();

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

    // Merge listing data if contact_id is provided
    let allVariables = { ...variables };

    if (contact_id) {
      const { data: listings } = await supabase
        .from("listings")
        .select("*")
        .eq("contact_id", contact_id)
        .eq("user_id", user_id)
        .limit(1);

      const listing = listings && listings.length > 0 ? listings[0] : null;

      if (listing) {
        allVariables = {
          ...allVariables,
          listing_address: listing.address_line1 || '',
          listing_city: listing.city || '',
          listing_state: listing.state || '',
          listing_zip: listing.postal_code || '',
          listing_price: listing.price ? `$${listing.price.toLocaleString()}` : '',
          listing_bedrooms: listing.bedrooms?.toString() || '',
          listing_bathrooms: listing.bathrooms?.toString() || '',
          listing_sqft: listing.living_area_value?.toString() || '',
          listing_type: listing.home_type || '',
          listing_url: listing.listing_url || '',
          listing_status: listing.status || '',
        };
      }
    }

    // Replace all placeholders
    const replacedContent = replacePlaceholders(template.content, allVariables);

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