import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FieldInfo {
  name: string;
  label: string;
  importance: 'required' | 'important' | 'optional';
}

interface GenerateTemplateRequest {
  title: string;
  category: string;
  selectedFields: FieldInfo[];
  description?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { title, category, selectedFields = [], description = '' }: GenerateTemplateRequest = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: 'Title is required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Generate template with field importance syntax
    const template = generateTemplateWithFieldImportance(title, category, selectedFields, description);

    return new Response(
      JSON.stringify({ template }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error generating template:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate template', details: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});

function generateTemplateWithFieldImportance(
  title: string,
  category: string,
  fields: FieldInfo[],
  description: string
): string {
  // Group fields by importance
  const requiredFields = fields.filter(f => f.importance === 'required');
  const importantFields = fields.filter(f => f.importance === 'important');
  const optionalFields = fields.filter(f => f.importance === 'optional');

  // Helper to format field based on importance
  const formatField = (field: FieldInfo): string => {
    switch (field.importance) {
      case 'required':
        // Required fields use standard syntax with fallback
        return `{{${field.name}}}`;
      case 'important':
        // Important fields use conditional blocks
        return `{{#if ${field.name}}}{{${field.name}}}{{/if}}`;
      case 'optional':
        // Optional fields use conditional blocks
        return `{{#if ${field.name}}}{{${field.name}}}{{/if}}`;
      default:
        return `{{${field.name}}}`;
    }
  };

  // Generate template based on category
  let template = '';

  // Greeting
  const nameField = fields.find(f => f.name === 'first_name' || f.name === 'name');
  if (nameField) {
    if (nameField.importance === 'required') {
      template += `Hi {{${nameField.name}}},\n\n`;
    } else if (nameField.importance === 'important') {
      template += `{{#if ${nameField.name}}}Hi {{${nameField.name}}}{{/if}}{{#unless ${nameField.name}}}Hi there{{/unless}},\n\n`;
    } else {
      template += `{{#if ${nameField.name}}}Hi {{${nameField.name}}}{{/if}}{{#unless ${nameField.name}}}Hello{{/unless}},\n\n`;
    }
  } else {
    template += `Hello,\n\n`;
  }

  // Main content based on category and description
  switch (category) {
    case 'Real Estate':
      template += generateRealEstateTemplate(fields, description, formatField);
      break;
    case 'Email Marketing':
      template += generateMarketingTemplate(fields, description, formatField);
      break;
    case 'Customer Service':
      template += generateCustomerServiceTemplate(fields, description, formatField);
      break;
    case 'Sales':
      template += generateSalesTemplate(fields, description, formatField);
      break;
    case 'Follow-up':
      template += generateFollowUpTemplate(fields, description, formatField);
      break;
    default:
      template += generateGenericTemplate(title, fields, description, formatField);
  }

  // Closing with sender info
  const senderNameField = fields.find(f => f.name === 'sender_name');
  const senderPhoneField = fields.find(f => f.name === 'sender_phone');
  const senderCityField = fields.find(f => f.name === 'sender_city');
  const senderStateField = fields.find(f => f.name === 'sender_state');

  template += `\n\nBest regards,\n`;

  if (senderNameField) {
    template += formatField(senderNameField) + `\n`;
  }

  if (senderPhoneField) {
    if (senderPhoneField.importance === 'optional' || senderPhoneField.importance === 'important') {
      template += `{{#if ${senderPhoneField.name}}}${formatField(senderPhoneField)}\n{{/if}}`;
    } else {
      template += formatField(senderPhoneField) + `\n`;
    }
  }

  if (senderCityField && senderStateField) {
    if (senderCityField.importance === 'optional' || senderStateField.importance === 'optional') {
      template += `{{#if ${senderCityField.name}}}{{#if ${senderStateField.name}}}${formatField(senderCityField)}, ${formatField(senderStateField)}{{/if}}{{/if}}`;
    }
  }

  return template;
}

function generateRealEstateTemplate(
  fields: FieldInfo[],
  description: string,
  formatField: (f: FieldInfo) => string
): string {
  let content = '';

  const listingAddress = fields.find(f => f.name === 'listing_address');
  const listingPrice = fields.find(f => f.name === 'listing_price');
  const listingBedrooms = fields.find(f => f.name === 'listing_bedrooms');
  const listingBathrooms = fields.find(f => f.name === 'listing_bathrooms');

  if (description) {
    content += `${description}\n\n`;
  } else {
    content += `Thank you for your interest in the property listing.\n\n`;
  }

  if (listingAddress) {
    if (listingAddress.importance === 'required') {
      content += `I wanted to reach out regarding the property at ${formatField(listingAddress)}.\n\n`;
    } else {
      content += `{{#if ${listingAddress.name}}}I wanted to reach out regarding the property at ${formatField(listingAddress)}.\n\n{{/if}}`;
    }
  }

  if (listingPrice || listingBedrooms || listingBathrooms) {
    content += `{{#if ${listingPrice?.name || listingBedrooms?.name || listingBathrooms?.name}}}This `;

    if (listingBedrooms) {
      content += `${formatField(listingBedrooms)} bedroom`;
      if (listingBathrooms) {
        content += `, ${formatField(listingBathrooms)} bathroom`;
      }
      content += ` home`;
    } else {
      content += `property`;
    }

    if (listingPrice) {
      content += ` is priced at ${formatField(listingPrice)}`;
    }

    content += `.\n\n{{/if}}`;
  }

  content += `I'd be happy to schedule a showing or answer any questions you may have about this property.`;

  return content;
}

function generateMarketingTemplate(
  fields: FieldInfo[],
  description: string,
  formatField: (f: FieldInfo) => string
): string {
  let content = '';

  if (description) {
    content += `${description}\n\n`;
  } else {
    content += `Thank you for your interest in our services.\n\n`;
  }

  const businessName = fields.find(f => f.name === 'business_name');
  if (businessName) {
    content += `{{#if ${businessName.name}}}We noticed you represent ${formatField(businessName)} and wanted to reach out with an opportunity that might interest you.\n\n{{/if}}`;
  }

  content += `We specialize in helping professionals like you grow your business and reach new clients.`;

  return content;
}

function generateCustomerServiceTemplate(
  fields: FieldInfo[],
  description: string,
  formatField: (f: FieldInfo) => string
): string {
  let content = '';

  if (description) {
    content += `${description}\n\n`;
  } else {
    content += `Thank you for reaching out to us.\n\n`;
  }

  content += `We're here to help and want to ensure you have the best experience possible. Please let us know if you have any questions or concerns.`;

  return content;
}

function generateSalesTemplate(
  fields: FieldInfo[],
  description: string,
  formatField: (f: FieldInfo) => string
): string {
  let content = '';

  const businessName = fields.find(f => f.name === 'business_name');
  const city = fields.find(f => f.name === 'city');

  if (description) {
    content += `${description}\n\n`;
  } else {
    content += `I wanted to reach out with an opportunity that could benefit `;

    if (businessName && businessName.importance !== 'required') {
      content += `{{#if ${businessName.name}}}${formatField(businessName)}{{/if}}{{#unless ${businessName.name}}}your business{{/unless}}`;
    } else if (businessName) {
      content += formatField(businessName);
    } else {
      content += `you`;
    }

    content += `.\n\n`;
  }

  if (city) {
    content += `{{#if ${city.name}}}We've been working with businesses in ${formatField(city)} and have seen great results.\n\n{{/if}}`;
  }

  content += `I'd love to discuss how we can help you achieve your goals.`;

  return content;
}

function generateFollowUpTemplate(
  fields: FieldInfo[],
  description: string,
  formatField: (f: FieldInfo) => string
): string {
  let content = '';

  if (description) {
    content += `${description}\n\n`;
  } else {
    content += `I wanted to follow up on our previous conversation.\n\n`;
  }

  content += `I'm reaching out to see if you have any questions or if there's anything I can help you with. Looking forward to hearing from you.`;

  return content;
}

function generateGenericTemplate(
  title: string,
  fields: FieldInfo[],
  description: string,
  formatField: (f: FieldInfo) => string
): string {
  let content = '';

  if (description) {
    content += `${description}\n\n`;
  } else if (title.toLowerCase().includes('welcome')) {
    content += `Welcome! We're thrilled to have you.\n\n`;
    content += `If you have any questions or need assistance, please don't hesitate to reach out.`;
  } else if (title.toLowerCase().includes('thank')) {
    content += `Thank you for reaching out.\n\n`;
    content += `I appreciate you taking the time to contact us. I'll make sure to address your inquiry promptly.`;
  } else {
    content += `Thank you for your message.\n\n`;
    content += `I'm here to assist you with whatever you need.`;
  }

  return content;
}
