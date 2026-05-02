import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateDraftsRequest {
  user_id: string;
  campaign_id?: string;
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

function applyFallbacks(
  variables: Record<string, string>,
  configMap: Map<string, PlaceholderConfig>
): Record<string, string> {
  const result: Record<string, string> = { ...variables };
  for (const [key, config] of configMap.entries()) {
    const value = result[key];
    if ((!value || value.trim() === '') && config.fallback_text && config.fallback_text.trim() !== '') {
      result[key] = config.fallback_text;
    }
  }
  return result;
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

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function replaceDocxParagraphPlaceholders(paragraphXml: string, variables: Record<string, string>): string {
  const tRegex = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
  const tMatches: Array<{ start: number; end: number; attrs: string; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = tRegex.exec(paragraphXml)) !== null) {
    tMatches.push({
      start: m.index,
      end: m.index + m[0].length,
      attrs: m[1],
      text: m[2],
    });
  }

  if (tMatches.length === 0) return paragraphXml;

  const combined = tMatches.map((t) => t.text).join('');
  if (!combined.includes('{{')) return paragraphXml;

  const replaced = replacePlaceholders(combined, variables);
  if (replaced === combined) return paragraphXml;

  let result = '';
  let cursor = 0;
  for (let i = 0; i < tMatches.length; i++) {
    const t = tMatches[i];
    result += paragraphXml.slice(cursor, t.start);
    if (i === 0) {
      const hasSpaceAttr = /xml:space=/.test(t.attrs);
      const attrs = hasSpaceAttr ? t.attrs : `${t.attrs} xml:space="preserve"`;
      result += `<w:t${attrs}>${escapeXmlText(replaced)}</w:t>`;
    } else {
      result += `<w:t${t.attrs}></w:t>`;
    }
    cursor = t.end;
  }
  result += paragraphXml.slice(cursor);
  return result;
}

function replaceDocxXmlPlaceholders(xml: string, variables: Record<string, string>): string {
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (para) =>
    replaceDocxParagraphPlaceholders(para, variables)
  );
}

async function replaceDocxPlaceholders(
  base64Content: string,
  variables: Record<string, string>
): Promise<string> {
  const bytes = base64ToBytes(base64Content);
  const zip = await JSZip.loadAsync(bytes);

  const targetPaths = Object.keys(zip.files).filter((path) =>
    /^word\/(document\d*|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(path)
  );

  for (const path of targetPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const updated = replaceDocxXmlPlaceholders(xml, variables);
    if (updated !== xml) {
      zip.file(path, updated);
    }
  }

  const output = await zip.generateAsync({ type: 'uint8array' });
  return bytesToBase64(output);
}

async function replaceAttachmentPlaceholders(
  rawContent: string,
  format: string | undefined,
  variables: Record<string, string>
): Promise<string> {
  const fmt = (format || '').toLowerCase();

  if (fmt === 'docx') {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed.originalFile === 'string') {
        const updatedBase64 = await replaceDocxPlaceholders(parsed.originalFile, variables);
        parsed.originalFile = updatedBase64;
        if (typeof parsed.preview === 'string') {
          parsed.preview = replacePlaceholders(parsed.preview, variables);
        }
        return JSON.stringify(parsed);
      }
    } catch (err) {
      console.error('Failed to replace placeholders in DOCX attachment, falling back to text replacement:', err);
    }
  }

  return replacePlaceholders(rawContent, variables);
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

    const placeholderConfigs = await getPlaceholderConfigs(supabase, user_id);

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
            close_date: (() => {
              const days = Number(campaign.days_till_close);
              if (!Number.isFinite(days) || days <= 0) return '';
              const d = new Date();
              d.setDate(d.getDate() + days);
              return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            })(),
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

            const replacedContent = await replaceAttachmentPlaceholders(
              selectedAttachmentTemplate.templates.content,
              selectedAttachmentTemplate.templates.format,
              variables
            );

            attachments.push({
              name: selectedAttachmentTemplate.templates.name,
              content: replacedContent,
              format: selectedAttachmentTemplate.templates.format,
            });
          }

          const subjectVariables = applyFallbacks(variables, placeholderConfigs);

          draftsToInsert.push({
            user_id,
            campaign_id: campaign.id,
            to_email: contact.email,
            from_email: fromEmail,
            subject: replacePlaceholders(subject, subjectVariables),
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
