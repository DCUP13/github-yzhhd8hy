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

    // Step 5: Generate emails for each contact
    const emailsToInsert = [];
    let emailIndex = 0;

    for (const contact of contacts) {
      try {
        // Select from email address (round-robin)
        const fromEmail = campaignEmails[emailIndex % campaignEmails.length].email_address;
        emailIndex++;

        // Build variables for template replacement
        const variables: Record<string, string> = {
          name: contact.name || '',
          email: contact.email || '',
          phone: contact.phone || '',
          business_name: contact.business_name || '',
          sender_name: campaign.sender_name || '',
          sender_phone: campaign.sender_phone || '',
          sender_city: campaign.sender_city || '',
          sender_state: campaign.sender_state || '',
          city: campaign.city || '',
          days_till_close: campaign.days_till_close || '',
          emd: campaign.emd || '',
          option_period: campaign.option_period || '',
          title_company: campaign.title_company || '',
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

        // Prepare attachments
        const attachments = attachmentTemplates.map(at => ({
          name: at.templates.name,
          content: replacePlaceholders(at.templates.content, variables),
          format: at.templates.format,
        }));

        emailsToInsert.push({
          user_id,
          to_email: contact.email,
          from_email: fromEmail,
          subject: replacePlaceholders(subject, variables),
          body: bodyContent,
          attachments: attachments.length > 0 ? JSON.stringify(attachments) : '[]',
          status: 'pending',
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

    // Step 6: Insert emails into outbox
    if (emailsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("email_outbox")
        .insert(emailsToInsert);

      if (insertError) {
        throw new Error(`Failed to insert emails: ${insertError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: contacts.length,
        emails_created: emailsToInsert.length,
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