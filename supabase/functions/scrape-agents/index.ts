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

interface AgentFromSearch {
  name?: string;
  link?: string;
  username?: string;
  encodedZuid?: string;
  imageUrl?: string;
  isTopAgent?: boolean;
  profileData?: Array<{
    __typename?: string;
    data?: string;
    label?: string;
  }>;
  reviewInformation?: {
    rating?: number;
    totalReviews?: string;
  };
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

    const allAgents: AgentFromSearch[] = [];
    let page = 1;

    // Fetch agents from all pages using new API endpoint
    while (page <= (max_pages || 5)) {
      try {
        const url = `https://${api_host}/agent/search?location=${encodeURIComponent(location)}&page=${page}`;
        const response = await fetch(url, {
          headers: {
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": api_host,
          },
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.error(`Rate limit exceeded on page ${page}. Stopping scrape.`);
            throw new Error(`Rate limit exceeded. Please check your RapidAPI quota and try again later. Successfully fetched ${allAgents.length} agents before rate limit.`);
          }
          console.error(`Failed to fetch page ${page}: ${response.status}`);
          break;
        }

        const data = await response.json();

        // Parse new API response structure
        const agents = data.agents || [];

        if (agents.length === 0) {
          console.log(`No more agents found on page ${page}`);
          break;
        }

        allAgents.push(...agents);
        console.log(`Fetched ${agents.length} agents from page ${page}`);
        page++;

        // Rate limiting - wait 2 seconds between requests to avoid 429 errors
        if (page <= max_pages) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        throw error;
      }
    }

    console.log(`Total agents fetched: ${allAgents.length}`);

    // Insert contacts into database
    // Note: Email and phone are not in search results, will be fetched via details endpoint
    const contactsToInsert = allAgents
      .filter((agent) => agent.username) // Only agents with username
      .map((agent) => {
        return {
          user_id,
          campaign_id,
          email: "", // Will be populated when fetching agent details
          name: agent.name || "",
          screen_name: agent.username || "",
          phone: "", // Will be populated when fetching agent details
          business_name: "", // Will be populated when fetching agent details
          profile_url: agent.link || "",
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