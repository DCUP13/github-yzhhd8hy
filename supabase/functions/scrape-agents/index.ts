import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MS = 1500;

interface FetchAgentsRequest {
  campaign_id: string;
  user_id: string;
}

interface AgentListItem {
  profileLink?: string;
}

interface AgentDetailsResponse {
  displayUser?: {
    encodedZuid?: string;
    screenName?: string;
    name?: string;
    businessName?: string;
    email?: string;
    phoneNumbers?: {
      cell?: string;
      brokerage?: string;
      business?: string;
    };
  };
  forSaleListings?: {
    listings?: Array<any>;
    listing_count?: number;
  };
  teamDisplayInformation?: {
    teamLeadInfo?: {
      teamName?: string;
      children?: Array<{
        screenName?: string;
      }>;
    };
  };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function releaseLock(supabase: any, campaign_id: string) {
  await supabase.rpc("release_scrape_lock", { p_campaign_id: campaign_id });
}

function scheduleSelf(campaign_id: string, user_id: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/scrape-agents`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
    },
    body: JSON.stringify({ campaign_id, user_id }),
  }).catch((err) => console.error("Failed to re-invoke scrape-agents:", err));
}

function scheduleDraft(campaign_id: string, user_id: string, contact_id: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-campaign`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
    },
    body: JSON.stringify({ campaign_id, user_id, contact_id }),
  }).catch((err) => console.error("Failed to trigger process-campaign:", err));
}

async function saveContactWithListings(
  supabase: any,
  user_id: string,
  campaign_id: string,
  screenName: string,
  agentDetails: AgentDetailsResponse,
  teamLeadId: string | null
): Promise<string | null> {
  const displayUser = agentDetails.displayUser;
  if (!displayUser) {
    return null;
  }

  const contactData = {
    user_id,
    campaign_id,
    email: displayUser.email || "",
    name: displayUser.name || "",
    screen_name: screenName,
    phone: displayUser.phoneNumbers?.cell || displayUser.phoneNumbers?.business || "",
    phone_cell: displayUser.phoneNumbers?.cell || "",
    phone_brokerage: displayUser.phoneNumbers?.brokerage || "",
    phone_business: displayUser.phoneNumbers?.business || "",
    business_name: displayUser.businessName || "",
    encoded_zuid: displayUser.encodedZuid || "",
    profile_url: `/profile/${screenName}`,
    is_team_lead: !!agentDetails.teamDisplayInformation?.teamLeadInfo,
    team_lead_id: teamLeadId,
    status: "pending",
    agent_data: agentDetails,
  };

  const { data: insertedContact, error: contactError } = await supabase
    .from("contacts")
    .upsert(contactData, { onConflict: "user_id,campaign_id,screen_name" })
    .select()
    .single();

  if (contactError) {
    console.error(`Error inserting contact ${screenName}:`, contactError);
    return null;
  }

  const listings = agentDetails.forSaleListings?.listings;
  if (listings && listings.length > 0) {
    for (const listing of listings) {
      const listingData = {
        contact_id: insertedContact.id,
        user_id,
        zpid: listing.zpid,
        home_type: listing.home_type || "",
        address_line1: listing.address?.line1 || "",
        address_line2: listing.address?.line2 || "",
        city: listing.address?.city || "",
        state: listing.address?.stateOrProvince || "",
        postal_code: listing.address?.postalCode || "",
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        price: listing.price,
        price_currency: listing.price_currency || "usd",
        status: listing.status || "",
        latitude: listing.latitude,
        longitude: listing.longitude,
        brokerage_name: listing.brokerage_name || "",
        listing_url: listing.listing_url || "",
        primary_photo_url: listing.primary_photo_url || "",
        open_houses: listing.openHouses || "",
        has_open_house: listing.hasOpenHouse || false,
        has_vr_model: listing.has_vr_model || false,
        listing_data: listing,
      };
      await supabase.from("listings").upsert(listingData, { onConflict: "contact_id,zpid" });
    }
  }

  return insertedContact.id as string;
}

async function checkActive(supabase: any, campaign_id: string): Promise<boolean> {
  const { data } = await supabase
    .from("campaigns")
    .select("is_active")
    .eq("id", campaign_id)
    .maybeSingle();
  return !!data?.is_active;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { campaign_id, user_id }: FetchAgentsRequest = await req.json();
    if (!campaign_id || !user_id) {
      throw new Error("Missing campaign_id or user_id");
    }

    // Acquire exclusive lock
    const { data: lockRows, error: lockError } = await supabase.rpc("acquire_scrape_lock", {
      p_campaign_id: campaign_id,
      p_user_id: user_id,
      p_lock_seconds: 30,
    });

    if (lockError) {
      throw new Error(`Lock acquire failed: ${lockError.message}`);
    }

    const lockRow = Array.isArray(lockRows) ? lockRows[0] : lockRows;
    if (!lockRow || !lockRow.locked) {
      return new Response(
        JSON.stringify({ success: true, skipped: "locked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const campaign = lockRow;

    if (!campaign.is_active) {
      await supabase.from("campaigns").update({ scrape_locked_until: null }).eq("id", campaign_id);
      return new Response(
        JSON.stringify({ success: true, paused: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const maxPages = max_pages || 5;

    let screenNames: string[] = Array.isArray(campaign.scrape_screen_names)
      ? (campaign.scrape_screen_names as string[])
      : [];
    let listPage: number = campaign.scrape_list_page ?? 0;
    let listComplete: boolean = campaign.scrape_list_complete ?? false;
    let scrapeIndex: number = campaign.scrape_index ?? 0;
    let teamMembers: string[] = Array.isArray(campaign.scrape_team_members)
      ? (campaign.scrape_team_members as string[])
      : [];
    let teamIndex: number = campaign.scrape_team_index ?? 0;

    // --- STEP 1: If we have pending team members to process, handle one ---
    if (teamMembers.length > 0 && teamIndex < teamMembers.length) {
      const memberScreenName = teamMembers[teamIndex];
      console.log(`Processing team member ${teamIndex + 1}/${teamMembers.length}: ${memberScreenName}`);

      // Find the team lead's contact_id for linking
      const currentAgentScreenName = screenNames[scrapeIndex - 1];
      const { data: leadContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("campaign_id", campaign_id)
        .eq("screen_name", currentAgentScreenName)
        .maybeSingle();

      const memberUrl = `https://${api_host}/agentDetails?username=${encodeURIComponent(memberScreenName)}`;
      const memberResp = await fetch(memberUrl, {
        headers: { "x-rapidapi-key": api_key, "x-rapidapi-host": api_host },
      });

      if (!memberResp.ok) {
        if (memberResp.status === 429) {
          await supabase.from("campaigns").update({
            scrape_error: `Rate limit on team member ${memberScreenName}. Will retry.`
          }).eq("id", campaign_id);
          await sleep(RATE_LIMIT_MS * 3);
          await releaseLock(supabase, campaign_id);
          if (await checkActive(supabase, campaign_id)) scheduleSelf(campaign_id, user_id);
          return new Response(
            JSON.stringify({ success: true, rate_limited: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error(`Failed team member ${memberScreenName}: ${memberResp.status}. Skipping.`);
      } else {
        const memberDetails: AgentDetailsResponse = await memberResp.json();
        const memberContactId = await saveContactWithListings(
          supabase, user_id, campaign_id, memberScreenName, memberDetails, leadContact?.id || null
        );
        if (memberContactId) {
          scheduleDraft(campaign_id, user_id, memberContactId);
        }
      }

      teamIndex += 1;
      await supabase.from("campaigns").update({
        scrape_team_index: teamIndex,
        scrape_error: "",
      }).eq("id", campaign_id);

      // If all team members done, clear team state
      if (teamIndex >= teamMembers.length) {
        await supabase.from("campaigns").update({
          scrape_team_members: [],
          scrape_team_index: 0,
        }).eq("id", campaign_id);
      }

      await sleep(RATE_LIMIT_MS);
      await releaseLock(supabase, campaign_id);
      if (await checkActive(supabase, campaign_id)) scheduleSelf(campaign_id, user_id);
      return new Response(
        JSON.stringify({ success: true, stage: "team_member", member: memberScreenName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- STEP 2: If we need a new page of agents, fetch one ---
    if (!listComplete && scrapeIndex >= screenNames.length) {
      const nextPage = listPage + 1;
      if (nextPage > maxPages) {
        listComplete = true;
        await supabase.from("campaigns").update({
          scrape_list_complete: true,
          scrape_error: "",
        }).eq("id", campaign_id);
        await releaseLock(supabase, campaign_id);
        return new Response(
          JSON.stringify({ success: true, stage: "complete", total_agents: screenNames.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Fetching agent list page ${nextPage}/${maxPages} for ${location}`);
      const url = `https://${api_host}/findAgentV2?location=${encodeURIComponent(location)}&page=${nextPage}`;
      const response = await fetch(url, {
        headers: { "x-rapidapi-key": api_key, "x-rapidapi-host": api_host },
      });

      if (!response.ok) {
        if (response.status === 429) {
          await supabase.from("campaigns").update({
            scrape_error: `Rate limit on list page ${nextPage}. Will retry.`
          }).eq("id", campaign_id);
          await sleep(RATE_LIMIT_MS * 2);
          await releaseLock(supabase, campaign_id);
          scheduleSelf(campaign_id, user_id);
          return new Response(
            JSON.stringify({ success: true, rate_limited: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error(`List page ${nextPage} failed: ${response.status}. Marking list complete.`);
        listComplete = true;
        await supabase.from("campaigns").update({
          scrape_list_complete: true,
          scrape_list_page: nextPage,
          scrape_last_page_count: 0,
          scrape_error: "",
        }).eq("id", campaign_id);
        await releaseLock(supabase, campaign_id);
        return new Response(
          JSON.stringify({ success: true, stage: "complete", total_agents: screenNames.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const professionals: AgentListItem[] = data.professionals || [];
      let pageCount = 0;

      if (professionals.length === 0) {
        listComplete = true;
        await supabase.from("campaigns").update({
          scrape_list_complete: true,
          scrape_list_page: nextPage,
          scrape_last_page_count: 0,
          scrape_error: "",
        }).eq("id", campaign_id);
        await releaseLock(supabase, campaign_id);
        return new Response(
          JSON.stringify({ success: true, stage: "complete", total_agents: screenNames.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const agent of professionals) {
        if (agent.profileLink) {
          const sn = agent.profileLink.replace("/profile/", "");
          if (sn && !screenNames.includes(sn)) {
            screenNames.push(sn);
            pageCount += 1;
          }
        }
      }

      listPage = nextPage;
      await supabase.from("campaigns").update({
        scrape_screen_names: screenNames,
        scrape_list_page: listPage,
        scrape_list_complete: false,
        scrape_last_page_count: pageCount,
        scrape_error: "",
      }).eq("id", campaign_id);

      await sleep(RATE_LIMIT_MS);
      await releaseLock(supabase, campaign_id);
      if (await checkActive(supabase, campaign_id)) scheduleSelf(campaign_id, user_id);
      return new Response(
        JSON.stringify({ success: true, stage: "list", page: listPage, new_agents: pageCount, total_agents: screenNames.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- STEP 3: All pages fetched and all agents processed ---
    if (scrapeIndex >= screenNames.length) {
      listComplete = true;
      await supabase.from("campaigns").update({
        scrape_list_complete: true,
        scrape_error: "",
      }).eq("id", campaign_id);
      await releaseLock(supabase, campaign_id);
      return new Response(
        JSON.stringify({ success: true, stage: "complete", total_agents: screenNames.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- STEP 4: Process one agent from the current page's agents ---
    const screenName = screenNames[scrapeIndex];
    console.log(`Processing agent ${scrapeIndex + 1}/${screenNames.length}: ${screenName}`);

    const detailsUrl = `https://${api_host}/agentDetails?username=${encodeURIComponent(screenName)}`;
    const detailsResponse = await fetch(detailsUrl, {
      headers: { "x-rapidapi-key": api_key, "x-rapidapi-host": api_host },
    });

    if (!detailsResponse.ok) {
      if (detailsResponse.status === 429) {
        await supabase.from("campaigns").update({
          scrape_error: `Rate limit on agent ${screenName}. Will retry.`
        }).eq("id", campaign_id);
        await sleep(RATE_LIMIT_MS * 3);
        await releaseLock(supabase, campaign_id);
        if (await checkActive(supabase, campaign_id)) scheduleSelf(campaign_id, user_id);
        return new Response(
          JSON.stringify({ success: true, rate_limited: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error(`Failed to fetch ${screenName}: ${detailsResponse.status}. Skipping.`);
    } else {
      const agentDetails: AgentDetailsResponse = await detailsResponse.json();
      const contactId = await saveContactWithListings(
        supabase, user_id, campaign_id, screenName, agentDetails, null
      );

      if (contactId) {
        console.log(`Saved contact ${screenName} (${contactId}). Triggering draft generation.`);
        scheduleDraft(campaign_id, user_id, contactId);
      }

      // If this agent is a team lead, store their team members for sequential processing
      const children = agentDetails.teamDisplayInformation?.teamLeadInfo?.children || [];
      const memberNames = children
        .map((c) => c.screenName)
        .filter((sn): sn is string => !!sn && sn !== screenName);

      if (memberNames.length > 0) {
        await supabase.from("campaigns").update({
          scrape_team_members: memberNames,
          scrape_team_index: 0,
        }).eq("id", campaign_id);
      }
    }

    // Advance agent index
    scrapeIndex += 1;
    await supabase.from("campaigns").update({
      scrape_index: scrapeIndex,
      scrape_error: "",
    }).eq("id", campaign_id);

    await sleep(RATE_LIMIT_MS);
    await releaseLock(supabase, campaign_id);
    if (await checkActive(supabase, campaign_id)) scheduleSelf(campaign_id, user_id);

    return new Response(
      JSON.stringify({
        success: true,
        stage: "agent",
        processed: scrapeIndex,
        total: screenNames.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in scrape-agents:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
