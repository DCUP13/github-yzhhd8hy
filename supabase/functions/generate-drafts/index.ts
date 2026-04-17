import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateDraftsRequest {
  user_id: string;
  campaign_id?: string;
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

function normalizeWhitespace(content: string): string {
  return content
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])[ \t]{2,}/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^[ \t]+/gm, (m, offset, str) => (offset === 0 || str[offset - 1] === '\n' ? '' : m))
    .replace(/\n{3,}/g, '\n\n');
}

function replacePlaceholders(content: string, variables: Record<string, string>): string {
  let result = processConditionalSections(content, variables);

  for (const [placeholder, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }

  result = result.replace(/\{\{\w+\}\}/g, '');

  return normalizeWhitespace(result);
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

    const { user_id, campaign_id }: GenerateDraftsRequest = await req.json();

    if (!user_id) {
      throw new Error("Missing user_id");
    }

    console.log(`Generating drafts for user: ${user_id}${campaign_id ? `, campaign: ${campaign_id}` : ''}`);

    // Get all campaigns with test mode enabled (or specific campaign if provided)
    let campaignQuery = supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", user_id)
      .eq("test_mode", true);

    if (campaign_id) {
      campaignQuery = campaignQuery.eq("id", campaign_id);
    }

    const { data: campaigns, error: campaignsError } = await campaignQuery;

    if (campaignsError) {
      throw new Error(`Failed to get campaigns: ${campaignsError.message}`);
    }

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No campaigns with test mode enabled found. Please enable test mode on at least one campaign.",
          drafts_created: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let totalDraftsCreated = 0;

    // Process each campaign
    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.id}`);

      // Get campaign templates
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
        .eq("campaign_id", campaign.id)
        .eq("user_id", user_id);

      if (templatesError) {
        console.error(`Failed to get templates for campaign ${campaign.id}:`, templatesError);
        continue;
      }

      // Find body and attachment templates
      const bodyTemplate = campaignTemplates?.find(ct => ct.template_type === 'body');
      const attachmentTemplates = campaignTemplates?.filter(ct => ct.template_type === 'attachment') || [];

      if (!bodyTemplate || !bodyTemplate.templates) {
        console.error(`No body template found for campaign ${campaign.id}`);
        continue;
      }

      // Get campaign email addresses
      const { data: campaignEmails, error: emailsError } = await supabase
        .from("campaign_emails")
        .select("email_address, provider")
        .eq("campaign_id", campaign.id)
        .eq("user_id", user_id);

      if (emailsError || !campaignEmails || campaignEmails.length === 0) {
        console.error(`No email addresses configured for campaign ${campaign.id}`);
        continue;
      }

      // Get contacts for this specific campaign
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", user_id)
        .eq("campaign_id", campaign.id);

      if (contactsError) {
        console.error(`Failed to get contacts for campaign ${campaign.id}:`, contactsError);
        continue;
      }

      if (!contacts || contacts.length === 0) {
        console.log(`No contacts found for campaign ${campaign.id}`);
        continue;
      }

      console.log(`Generating drafts for ${contacts.length} contacts`);

      // Generate drafts for each contact
      const draftsToInsert = [];
      let emailIndex = 0;
      let attachmentIndex = 0;

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
            first_name: contact.first_name_parsed || contact.name?.split(' ')[0] || '',
            last_name: contact.last_name_parsed || contact.name?.split(' ').slice(1).join(' ') || '',
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

          // Prepare attachments - cycle through if multiple
          const attachments = [];
          if (attachmentTemplates.length > 0) {
            // If there's only one attachment, use it for all drafts
            // If there are multiple, cycle through them (round-robin)
            const selectedAttachmentTemplate = attachmentTemplates[attachmentIndex % attachmentTemplates.length];
            attachmentIndex++;

            attachments.push({
              name: selectedAttachmentTemplate.templates.name,
              content: replacePlaceholders(selectedAttachmentTemplate.templates.content, variables),
              format: selectedAttachmentTemplate.templates.format,
            });
          }

          draftsToInsert.push({
            user_id,
            campaign_id: campaign.id,
            to_email: contact.email,
            from_email: fromEmail,
            subject: replacePlaceholders(subject, variables),
            body: bodyContent,
            attachments,
          });

        } catch (error) {
          console.error(`Error generating draft for contact ${contact.id}:`, error);
        }
      }

      // Insert drafts
      if (draftsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("email_drafts")
          .insert(draftsToInsert);

        if (insertError) {
          console.error(`Failed to insert drafts for campaign ${campaign.id}:`, insertError);
          continue;
        }

        totalDraftsCreated += draftsToInsert.length;
        console.log(`Inserted ${draftsToInsert.length} drafts for campaign ${campaign.id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        drafts_created: totalDraftsCreated,
        campaigns_processed: campaigns.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in generate-drafts:", error);
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
