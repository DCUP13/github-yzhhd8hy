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
  use_smart_fallbacks?: boolean;
  campaign_id?: string;
}

interface PlaceholderConfig {
  tier: 'critical' | 'important' | 'optional';
  fallback_text: string;
}

async function getPlaceholderConfig(
  supabase: any,
  userId: string,
  placeholderKey: string
): Promise<PlaceholderConfig | null> {
  const { data: userConfig } = await supabase
    .from("placeholder_config")
    .select("tier, fallback_text")
    .eq("user_id", userId)
    .eq("placeholder_key", placeholderKey)
    .maybeSingle();

  if (userConfig) {
    return userConfig;
  }

  const { data: defaultConfig } = await supabase
    .from("default_placeholder_config")
    .select("tier, fallback_text")
    .eq("placeholder_key", placeholderKey)
    .maybeSingle();

  return defaultConfig;
}

function processConditionalSections(content: string, variables: Record<string, string>): string {
  let result = content;
  const innermostPattern = /\{\{#if\s+(\w+)\}\}((?:(?!\{\{#if\s)[\s\S])*?)\{\{\/if\}\}/g;

  let prev = '';
  while (prev !== result) {
    prev = result;
    result = result.replace(innermostPattern, (_match, placeholderKey, innerContent) => {
      const value = variables[placeholderKey];
      if (value && value.trim() !== '') {
        return innerContent;
      }
      return '';
    });
  }

  result = result.replace(/\{\{\/if\}\}/g, '');

  return result;
}

async function replacePlaceholders(
  content: string,
  variables: Record<string, string>,
  supabase: any,
  userId: string,
  useSmartFallbacks: boolean = true
): Promise<{ content: string; missingFields: string[] }> {
  let result = content;
  const missingFields: string[] = [];

  const placeholderPattern = /\{\{(\w+)\}\}/g;
  const placeholders = new Set<string>();
  let match;

  while ((match = placeholderPattern.exec(content)) !== null) {
    placeholders.add(match[1]);
  }

  for (const placeholder of placeholders) {
    const value = variables[placeholder];
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');

    if (!value || value.trim() === '') {
      missingFields.push(placeholder);

      if (useSmartFallbacks) {
        const config = await getPlaceholderConfig(supabase, userId, placeholder);
        if (config && config.fallback_text) {
          result = result.replace(regex, config.fallback_text);
        } else {
          result = result.replace(regex, '');
        }
      } else {
        result = result.replace(regex, '');
      }
    } else {
      result = result.replace(regex, value);
    }
  }

  return { content: result, missingFields };
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

    const { template_id, user_id, variables, contact_id, use_smart_fallbacks, campaign_id }: ReplaceVariablesRequest = await req.json();

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

    // Get campaign settings if campaign_id is provided
    let useSmartFallbacks = use_smart_fallbacks ?? true;
    if (campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("use_smart_fallbacks")
        .eq("id", campaign_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (campaign) {
        useSmartFallbacks = campaign.use_smart_fallbacks;
      }
    }

    // Process conditional sections first
    let processedContent = processConditionalSections(template.content, allVariables);

    // Replace all placeholders with smart fallbacks
    const { content: replacedContent, missingFields } = await replacePlaceholders(
      processedContent,
      allVariables,
      supabase,
      user_id,
      useSmartFallbacks
    );

    return new Response(
      JSON.stringify({
        success: true,
        content: replacedContent,
        format: template.format,
        name: template.name,
        missing_fields: missingFields,
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