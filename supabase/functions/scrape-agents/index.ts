import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FetchAgentsRequest {
  campaign_id: string;
  user_id: string;
}

interface AgentProfessional {
  encodedZuid?: string;
  screenName?: string;
  businessName?: string;
  profileUrl?: string;
  email?: string;
  name?: string;
  phoneNumber?: { areaCode?: string; prefix?: string; number?: string };
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

    const { campaign_id, user_id }: FetchAgentsRequest = await req.json();

    if (!campaign_id || !user_id) {
      throw new Error("Missing campaign_id or user_id");
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("city")
      .eq("id", campaign_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignError?.message}`);
    }

    // Get RapidAPI settings
    const { data: rapidApiSettings, error: settingsError } = await supabase
      .from("rapid_api_settings")
      .select("api_key, api_host, max_pages")
      .eq("user_id", user_id)
      .maybeSingle();

    if (settingsError || !rapidApiSettings) {
      throw new Error(`RapidAPI settings not found: ${settingsError?.message}`);
    }

    const { api_key, api_host, max_pages } = rapidApiSettings;
    const location = campaign.city;

    console.log(`Fetching agents for ${location}, max ${max_pages} pages`);

    const allAgents: AgentProfessional[] = [];
    let page = 1;

    // Fetch agents from all pages
    while (page <= (max_pages || 5)) {
      try {
        const url = `https://${api_host}/findAgentV2?location=${encodeURIComponent(location)}&page=${page}`;
        const response = await fetch(url, {
          headers: {
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": api_host,
          },
        });

        if (!response.ok) {
          console.error(`Failed to fetch page ${page}: ${response.status}`);
          break;
        }

        const data = await response.json();
        const professionals = data.professionals || [];

        if (professionals.length === 0) {
          console.log(`No more agents found on page ${page}`);
          break;
        }

        allAgents.push(...professionals);
        console.log(`Fetched ${professionals.length} agents from page ${page}`);
        page++;

        // Rate limiting - wait 1 second between requests
        if (page <= max_pages) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        break;
      }
    }

    console.log(`Total agents fetched: ${allAgents.length}`);

    // Insert contacts into database
    const contactsToInsert = allAgents
      .filter((agent) => agent.email) // Only agents with email
      .map((agent) => {
        const phoneNumber = agent.phoneNumber
          ? `${agent.phoneNumber.areaCode || ""}${agent.phoneNumber.prefix || ""}${agent.phoneNumber.number || ""}`
          : "";

        return {
          user_id,
          campaign_id,
          email: agent.email || "",
          name: agent.name || "",
          screen_name: agent.screenName || "",
          phone: phoneNumber,
          business_name: agent.businessName || "",
          profile_url: agent.profileUrl || "",
          status: "pending",
          agent_data: agent,
        };
      });

    if (contactsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("contacts")
        .insert(contactsToInsert);

      if (insertError) {
        console.error("Error inserting contacts:", insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_agents: allAgents.length,
        contacts_inserted: contactsToInsert.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in scrape-agents:", error);
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