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

interface AgentListItem {
  businessName?: string;
  encodedZuid?: string;
  fullName?: string;
  location?: string;
  phoneNumber?: string;
  profileLink?: string;
  profilePhotoSrc?: string;
  reviewExcerpt?: string;
  reviewExcerptDate?: string;
  reviewLink?: string;
  numTotalReviews?: number;
  reviews?: string;
  reviewStarsRating?: number;
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
        name?: string;
        screenName?: string;
        ratings?: {
          count?: number;
          average?: number;
        };
        profilePhotoUrl?: string;
        isTopAgent?: boolean;
        encodedZuid?: string;
      }>;
    };
    teamMemberInfo?: any;
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

    const allScreenNames: string[] = [];
    let page = 1;
    let totalContacts = 0;
    let totalListings = 0;

    // Step 1: Fetch agent list using findAgentV2 endpoint
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
          if (response.status === 429) {
            console.error(`Rate limit exceeded on page ${page}. Stopping scrape.`);
            throw new Error(`Rate limit exceeded. Please check your RapidAPI quota and try again later. Successfully fetched ${allScreenNames.length} agents before rate limit.`);
          }
          console.error(`Failed to fetch page ${page}: ${response.status}`);
          break;
        }

        const data = await response.json();
        const professionals: AgentListItem[] = data.professionals || [];

        if (professionals.length === 0) {
          console.log(`No more agents found on page ${page}`);
          break;
        }

        // Extract screennames from profileLink
        for (const agent of professionals) {
          if (agent.profileLink) {
            const screenName = agent.profileLink.replace("/profile/", "");
            if (screenName && !allScreenNames.includes(screenName)) {
              allScreenNames.push(screenName);
            }
          }
        }

        console.log(`Fetched ${professionals.length} agents from page ${page}`);
        page++;

        // Rate limiting
        if (page <= max_pages) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        throw error;
      }
    }

    console.log(`Total screennames collected: ${allScreenNames.length}`);

    // Step 2: Fetch details for each agent using agentDetails endpoint
    for (const screenName of allScreenNames) {
      try {
        console.log(`Fetching details for ${screenName}`);

        const detailsUrl = `https://${api_host}/agentDetails?screenName=${encodeURIComponent(screenName)}`;
        const detailsResponse = await fetch(detailsUrl, {
          headers: {
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": api_host,
          },
        });

        if (!detailsResponse.ok) {
          if (detailsResponse.status === 429) {
            console.error(`Rate limit exceeded fetching details. Processed ${totalContacts} contacts so far.`);
            break;
          }
          console.error(`Failed to fetch details for ${screenName}: ${detailsResponse.status}`);
          continue;
        }

        const agentDetails: AgentDetailsResponse = await detailsResponse.json();
        const displayUser = agentDetails.displayUser;

        if (!displayUser) {
          console.log(`No displayUser data for ${screenName}`);
          continue;
        }

        // Insert or update contact
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
          status: "processed",
          agent_data: agentDetails,
        };

        const { data: insertedContact, error: contactError } = await supabase
          .from("contacts")
          .upsert(contactData, {
            onConflict: "user_id,campaign_id,screen_name",
          })
          .select()
          .single();

        if (contactError) {
          console.error(`Error inserting contact ${screenName}:`, contactError);
          continue;
        }

        totalContacts++;
        console.log(`Saved contact: ${displayUser.name}`);

        // Step 3: Save listings if any
        if (agentDetails.forSaleListings?.listings && insertedContact) {
          const listings = agentDetails.forSaleListings.listings;

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
              living_area_value: listing.livingAreaValue,
              living_area_units: listing.livingAreaUnitsShort || "sqft",
              listing_data: listing,
            };

            const { error: listingError } = await supabase
              .from("listings")
              .upsert(listingData, {
                onConflict: "contact_id,zpid",
              });

            if (listingError) {
              console.error(`Error inserting listing for ${screenName}:`, listingError);
            } else {
              totalListings++;
            }
          }

          console.log(`Saved ${listings.length} listings for ${displayUser.name}`);
        }

        // Step 4: Process team members if this is a team lead
        if (agentDetails.teamDisplayInformation?.teamLeadInfo?.children) {
          const teamMembers = agentDetails.teamDisplayInformation.teamLeadInfo.children;
          console.log(`Processing ${teamMembers.length} team members for ${displayUser.name}`);

          for (const member of teamMembers) {
            if (!member.screenName) continue;

            try {
              console.log(`Fetching details for team member ${member.screenName}`);

              const memberDetailsUrl = `https://${api_host}/agentDetails?screenName=${encodeURIComponent(member.screenName)}`;
              const memberDetailsResponse = await fetch(memberDetailsUrl, {
                headers: {
                  "x-rapidapi-key": api_key,
                  "x-rapidapi-host": api_host,
                },
              });

              if (!memberDetailsResponse.ok) {
                if (memberDetailsResponse.status === 429) {
                  console.error(`Rate limit exceeded fetching team member details.`);
                  break;
                }
                console.error(`Failed to fetch details for team member ${member.screenName}: ${memberDetailsResponse.status}`);
                continue;
              }

              const memberDetails: AgentDetailsResponse = await memberDetailsResponse.json();
              const memberDisplayUser = memberDetails.displayUser;

              if (!memberDisplayUser) {
                console.log(`No displayUser data for team member ${member.screenName}`);
                continue;
              }

              // Insert team member contact
              const memberContactData = {
                user_id,
                campaign_id,
                email: memberDisplayUser.email || "",
                name: memberDisplayUser.name || "",
                screen_name: member.screenName,
                phone: memberDisplayUser.phoneNumbers?.cell || memberDisplayUser.phoneNumbers?.business || "",
                phone_cell: memberDisplayUser.phoneNumbers?.cell || "",
                phone_brokerage: memberDisplayUser.phoneNumbers?.brokerage || "",
                phone_business: memberDisplayUser.phoneNumbers?.business || "",
                business_name: memberDisplayUser.businessName || "",
                encoded_zuid: memberDisplayUser.encodedZuid || "",
                profile_url: `/profile/${member.screenName}`,
                is_team_lead: false,
                status: "processed",
                agent_data: memberDetails,
              };

              const { data: insertedMemberContact, error: memberContactError } = await supabase
                .from("contacts")
                .upsert(memberContactData, {
                  onConflict: "user_id,campaign_id,screen_name",
                })
                .select()
                .single();

              if (memberContactError) {
                console.error(`Error inserting team member contact ${member.screenName}:`, memberContactError);
                continue;
              }

              totalContacts++;
              console.log(`Saved team member contact: ${memberDisplayUser.name}`);

              // Save team member listings
              if (memberDetails.forSaleListings?.listings && insertedMemberContact) {
                const memberListings = memberDetails.forSaleListings.listings;

                for (const listing of memberListings) {
                  const listingData = {
                    contact_id: insertedMemberContact.id,
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
                    living_area_value: listing.livingAreaValue,
                    living_area_units: listing.livingAreaUnitsShort || "sqft",
                    listing_data: listing,
                  };

                  const { error: listingError } = await supabase
                    .from("listings")
                    .upsert(listingData, {
                      onConflict: "contact_id,zpid",
                    });

                  if (listingError) {
                    console.error(`Error inserting listing for team member ${member.screenName}:`, listingError);
                  } else {
                    totalListings++;
                  }
                }

                console.log(`Saved ${memberListings.length} listings for team member ${memberDisplayUser.name}`);
              }

              // Rate limiting
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } catch (error) {
              console.error(`Error processing team member ${member.screenName}:`, error);
            }
          }
        }

        // Rate limiting between agents
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing agent ${screenName}:`, error);
      }
    }

    console.log(`Processing complete. Total contacts: ${totalContacts}, Total listings: ${totalListings}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_agents_found: allScreenNames.length,
        contacts_saved: totalContacts,
        listings_saved: totalListings,
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
