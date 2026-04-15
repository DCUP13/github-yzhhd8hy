import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProcessCampaignRequest {
  campaign_id: string;
  user_id: string;
}

interface PlaceholderConfig {
  tier: 'critical' | 'important' | 'optional';
  fallback_text: string;
}

async function getPlaceholderConfigs(supabase: any, userId: string): Promise<Map<string, PlaceholderConfig>> {
  const configMap = new Map<string, PlaceholderConfig>();

  const { data: defaultConfigs } = await supabase
    .from("default_placeholder_config")
    .select("placeholder_key, tier, fallback_text");

  if (defaultConfigs) {
    for (const config of defaultConfigs) {
      configMap.set(config.placeholder_key, {
        tier: config.tier,
        fallback_text: config.fallback_text,
      });
    }
  }

  const { data: userConfigs } = await supabase
    .from("placeholder_config")
    .select("placeholder_key, tier, fallback_text")
    .eq("user_id", userId);

  if (userConfigs) {
    for (const config of userConfigs) {
      configMap.set(config.placeholder_key, {
        tier: config.tier,
        fallback_text: config.fallback_text,
      });
    }
  }

  return configMap;
}

function calculateDataQualityScore(
  variables: Record<string, string>,
  configMap: Map<string, PlaceholderConfig>
): { score: number; missingFields: string[] } {
  let totalWeight = 0;
  let achievedWeight = 0;
  const missingFields: string[] = [];

  const weights = {
    critical: 10,
    important: 5,
    optional: 1,
  };

  for (const [key, config] of configMap.entries()) {
    const weight = weights[config.tier];
    totalWeight += weight;

    const value = variables[key];
    if (value && value.trim() !== '') {
      achievedWeight += weight;
    } else {
      missingFields.push(key);
    }
  }

  const score = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;
  return { score, missingFields };
}

function replacePlaceholders(content: string, variables: Record<string, string>): string {
  let result = content;

  for (const [placeholder, value] of Object.entries(variables)) {
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

    const { campaign_id, user_id }: ProcessCampaignRequest = await req.json();

    if (!campaign_id || !user_id) {
      throw new Error("Missing campaign_id or user_id");
    }

    console.log(`Processing campaign: ${campaign_id}`);

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignError?.message}`);
    }

    if (!campaign.is_active) {
      throw new Error("Campaign is not active");
    }

    // Check if test mode is enabled for this campaign
    const testModeEnabled = campaign.test_mode ?? false;
    console.log(`Test mode: ${testModeEnabled ? 'ENABLED - emails will go to drafts' : 'DISABLED - emails will go to outbox'}`);

    // Step 1: Scrape agents if no contacts exist
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("id")
      .eq("campaign_id", campaign_id)
      .limit(1);

    if (!existingContacts || existingContacts.length === 0) {
      console.log("No contacts found, scraping agents...");
      
      const scrapeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/scrape-agents`;
      const scrapeResponse = await fetch(scrapeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ campaign_id, user_id }),
      });

      const scrapeResult = await scrapeResponse.json();
      if (!scrapeResult.success) {
        throw new Error(`Failed to scrape agents: ${scrapeResult.error}`);
      }

      console.log(`Scraped ${scrapeResult.contacts_inserted} contacts`);
    }

    // Step 2: Get campaign templates
    const { data: campaignTemplates, error: templatesError } = await supabase
      .from("campaign_templates")
      .select(`
        id,
        template_id,
        template_type,
        templates (
          id,
          name,
          content,
          format
        )
      `)
      .eq("campaign_id", campaign_id)
      .eq("user_id", user_id);

    if (templatesError) {
      throw new Error(`Failed to get templates: ${templatesError.message}`);
    }

    // Find body and attachment templates
    const bodyTemplate = campaignTemplates?.find(ct => ct.template_type === 'body');
    const attachmentTemplates = campaignTemplates?.filter(ct => ct.template_type === 'attachment') || [];

    if (!bodyTemplate || !bodyTemplate.templates) {
      throw new Error("No body template found for campaign");
    }

    // Step 3: Get campaign email addresses
    const { data: campaignEmails, error: emailsError } = await supabase
      .from("campaign_emails")
      .select("email_address, provider")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user_id);

    if (emailsError || !campaignEmails || campaignEmails.length === 0) {
      throw new Error("No email addresses configured for campaign");
    }

    // Step 4: Get pending contacts
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user_id)
      .eq("status", "pending")
      .limit(100); // Process 100 at a time

    if (contactsError) {
      throw new Error(`Failed to get contacts: ${contactsError.message}`);
    }

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending contacts to process",
          processed: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`Processing ${contacts.length} contacts`);

    // Get placeholder configurations for data quality validation
    const placeholderConfigs = await getPlaceholderConfigs(supabase, user_id);

    // Step 5: Generate emails for each contact
    const emailsToInsert = [];
    const skippedContacts = [];
    let emailIndex = 0;

    for (const contact of contacts) {
      try {
        // Select from email address (round-robin)
        const fromEmail = campaignEmails[emailIndex % campaignEmails.length].email_address;
        emailIndex++;

        // Fetch listing data for this contact
        const { data: listings } = await supabase
          .from("listings")
          .select("*")
          .eq("contact_id", contact.id)
          .eq("user_id", user_id)
          .limit(1);

        const listing = listings && listings.length > 0 ? listings[0] : null;

        // Build variables for template replacement
        const variables: Record<string, string> = {
          first_name: contact.name?.split(' ')[0] || '',
          last_name: contact.name?.split(' ').slice(1).join(' ') || '',
          name: contact.name || '',
          email: contact.email || '',
          phone: contact.phone || '',
          phone_cell: contact.phone_cell || '',
          phone_brokerage: contact.phone_brokerage || '',
          phone_business: contact.phone_business || '',
          business_name: contact.business_name || '',
          screen_name: contact.screen_name || '',
          profile_url: contact.profile_url || '',
          sender_name: campaign.sender_name || '',
          sender_phone: campaign.sender_phone || '',
          sender_city: campaign.sender_city || '',
          sender_state: campaign.sender_state || '',
          city: campaign.city || '',
          days_till_close: campaign.days_till_close || '',
          emd: campaign.emd || '',
          option_period: campaign.option_period || '',
          title_company: campaign.title_company || '',
          listing_address: listing?.address_line1 || '',
          listing_city: listing?.city || '',
          listing_state: listing?.state || '',
          listing_zip: listing?.postal_code || '',
          listing_price: listing?.price ? `$${listing.price.toLocaleString()}` : '',
          listing_bedrooms: listing?.bedrooms?.toString() || '',
          listing_bathrooms: listing?.bathrooms?.toString() || '',
          listing_sqft: listing?.living_area_value?.toString() || '',
          listing_type: listing?.home_type || '',
          listing_url: listing?.listing_url || '',
          listing_status: listing?.status || '',
        };

        // Calculate data quality score
        const { score: dataQualityScore, missingFields } = calculateDataQualityScore(
          variables,
          placeholderConfigs
        );

        // Update contact with data quality info
        await supabase
          .from("contacts")
          .update({
            data_quality_score: dataQualityScore,
            missing_fields: missingFields,
          })
          .eq("id", contact.id);

        // Check if contact should be skipped based on data quality
        const minQualityScore = campaign.min_data_quality_score ?? 50;
        const skipIncomplete = campaign.skip_incomplete_contacts ?? false;

        if (skipIncomplete && dataQualityScore < minQualityScore) {
          console.log(`Skipping contact ${contact.email} - quality score ${dataQualityScore} below threshold ${minQualityScore}`);

          skippedContacts.push({
            contact_id: contact.id,
            email: contact.email,
            score: dataQualityScore,
            missing: missingFields,
          });

          // If in test mode, create a draft with skip info in subject
          if (testModeEnabled) {
            emailsToInsert.push({
              user_id,
              campaign_id,
              to_email: contact.email,
              from_email: fromEmail,
              subject: `[SKIPPED - Quality: ${dataQualityScore}%] Missing: ${missingFields.join(', ')}`,
              body: `This contact was skipped due to low data quality score.\n\nScore: ${dataQualityScore}%\nThreshold: ${minQualityScore}%\nMissing Fields: ${missingFields.join(', ')}`,
              attachments: '[]',
            });
          }

          // Update contact status to processed (but skipped)
          await supabase
            .from("contacts")
            .update({ status: 'processed' })
            .eq("id", contact.id);

          continue;
        }

        // Replace variables in body template
        const bodyContent = replacePlaceholders(
          bodyTemplate.templates.content,
          variables
        );

        // Select random subject line
        const subjectLines = campaign.subject_lines || [];
        const subject = subjectLines.length > 0
          ? subjectLines[Math.floor(Math.random() * subjectLines.length)]
          : 'No Subject';

        // Prepare attachments
        const attachments = attachmentTemplates.map(at => ({
          name: at.templates.name,
          content: replacePlaceholders(at.templates.content, variables),
          format: at.templates.format,
        }));

        emailsToInsert.push({
          user_id,
          campaign_id,
          to_email: contact.email,
          from_email: fromEmail,
          subject: replacePlaceholders(subject, variables),
          body: bodyContent,
          attachments: attachments.length > 0 ? JSON.stringify(attachments) : '[]',
          status: 'pending',
          skipped: false,
        });

        // Update contact status
        await supabase
          .from("contacts")
          .update({ status: 'processed' })
          .eq("id", contact.id);

      } catch (error) {
        console.error(`Error processing contact ${contact.id}:`, error);
        // Mark contact as failed
        await supabase
          .from("contacts")
          .update({ status: 'failed' })
          .eq("id", contact.id);
      }
    }

    // Step 6: Insert emails into outbox or drafts based on test mode
    if (emailsToInsert.length > 0) {
      const tableName = testModeEnabled ? "email_drafts" : "email_outbox";

      // Remove status field for drafts (they don't have status column)
      const dataToInsert = testModeEnabled
        ? emailsToInsert.map(({ status, ...rest }) => rest)
        : emailsToInsert;

      const { error: insertError } = await supabase
        .from(tableName)
        .insert(dataToInsert);

      if (insertError) {
        throw new Error(`Failed to insert emails: ${insertError.message}`);
      }

      console.log(`Inserted ${emailsToInsert.length} emails into ${tableName}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: contacts.length,
        emails_created: emailsToInsert.length,
        skipped_contacts: skippedContacts.length,
        skipped_details: skippedContacts,
        test_mode: testModeEnabled,
        destination: testModeEnabled ? 'drafts' : 'outbox',
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in process-campaign:", error);
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