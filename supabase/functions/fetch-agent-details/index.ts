import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FetchDetailsRequest {
  screen_name: string;
  user_id: string;
  contact_id?: string;
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

    const { screen_name, user_id, contact_id }: FetchDetailsRequest = await req.json();

    if (!screen_name || !user_id) {
      throw new Error("Missing screen_name or user_id");
    }

    // Get RapidAPI settings
    const { data: rapidApiSettings, error: settingsError } = await supabase
      .from("rapid_api_settings")
      .select("api_key, api_host")
      .eq("user_id", user_id)
      .maybeSingle();

    if (settingsError || !rapidApiSettings) {
      throw new Error(`RapidAPI settings not found: ${settingsError?.message}`);
    }

    const { api_key, api_host } = rapidApiSettings;

    console.log(`Fetching details for agent: ${screen_name}`);

    const url = `https://${api_host}/agentDetails?username=${encodeURIComponent(screen_name)}`;
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": api_host,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch agent details: ${response.status}`);
    }

    const data = await response.json();

    if (!data.displayUser) {
      throw new Error("Invalid response structure from API");
    }

    // Update contact with detailed information if contact_id is provided
    if (contact_id) {
      const { error: updateError } = await supabase
        .from("contacts")
        .update({
          agent_data: data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contact_id)
        .eq("user_id", user_id);

      if (updateError) {
        console.error("Error updating contact:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in fetch-agent-details:", error);
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