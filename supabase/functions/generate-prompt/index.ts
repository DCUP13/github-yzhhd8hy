const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GeneratePromptRequest {
  title: string;
  category: string;
  variables?: string[];
  context?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { title, category, variables = [], context = '' }: GeneratePromptRequest = await req.json();

    if (!title && !category) {
      return new Response(
        JSON.stringify({ error: 'Title or category is required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const variablesList = variables.length > 0
      ? `\n\nAvailable variables to use: ${variables.map(v => `{{${v}}}`).join(', ')}`
      : '';

    const contextInfo = context
      ? `\n\nAdditional context: ${context}`
      : '';

    const systemPrompt = `You are an AI assistant that helps create effective prompts for email autoresponders and automated communication systems.

Your task is to generate a clear, professional prompt based on the user's requirements.

Guidelines:
- Create prompts that are specific, actionable, and professional
- Use variables (in {{variable_name}} format) when appropriate to personalize the response
- Keep the tone appropriate for the category
- Make prompts that can be used by an AI to generate helpful, contextual responses
- Don't include XML tags, just return the plain prompt text
- Don't include explanations, just the prompt itself`;

    const userPrompt = `Create a prompt for:
Title: ${title}
Category: ${category}${variablesList}${contextInfo}

Generate a professional, effective prompt that an AI can use to respond to emails in this category. Include relevant variables where appropriate.`;

    const prompt = generateMockPrompt(title, category, variables);

    return new Response(
      JSON.stringify({ prompt }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error generating prompt:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate prompt', details: error.message }),
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

function generateMockPrompt(title: string, category: string, variables: string[]): string {
  const hasRecipient = variables.includes('recipient_name');
  const hasSender = variables.includes('sender_name');
  const hasSubject = variables.includes('subject');
  const hasPrevious = variables.includes('previous_message');

  const greetingPart = hasRecipient ? `Hi {{recipient_name}},\n\n` : `Hello,\n\n`;

  let mainContent = '';

  switch (category) {
    case 'Real Estate':
      mainContent = `Thank you for your inquiry about the property. I'd be happy to help you with any questions you have.\n\n`;
      if (hasPrevious) {
        mainContent += `Regarding your message: "{{previous_message}}"\n\n`;
      }
      mainContent += `I'm here to provide you with detailed information about available properties, schedule viewings, and guide you through the buying or selling process.`;
      break;

    case 'Email Marketing':
      mainContent = `Thank you for subscribing to our newsletter. We're excited to have you as part of our community.\n\n`;
      mainContent += `You'll receive regular updates about our latest offers, industry insights, and exclusive content designed just for our subscribers.`;
      break;

    case 'Customer Service':
      if (hasPrevious) {
        mainContent = `I received your message regarding: "{{previous_message}}"\n\n`;
      }
      mainContent += `I understand your concern and I'm here to help resolve this for you. Our team is committed to ensuring you have the best experience possible.`;
      break;

    case 'Sales':
      mainContent = `Thank you for your interest in our products/services.\n\n`;
      mainContent += `I'd be delighted to provide you with more information and help you find the perfect solution for your needs.`;
      break;

    case 'Follow-up':
      mainContent = `I wanted to follow up on our previous conversation.\n\n`;
      if (hasSubject) {
        mainContent += `Regarding {{subject}}, `;
      }
      mainContent += `I'm reaching out to see if you have any questions or if there's anything I can help you with.`;
      break;

    default:
      if (title.toLowerCase().includes('welcome')) {
        mainContent = `Welcome! We're thrilled to have you.\n\n`;
        mainContent += `If you have any questions or need assistance, please don't hesitate to reach out.`;
      } else if (title.toLowerCase().includes('thank')) {
        mainContent = `Thank you for reaching out.\n\n`;
        mainContent += `I appreciate you taking the time to contact us. I'll make sure to address your inquiry promptly.`;
      } else {
        mainContent = `Thank you for your message.\n\n`;
        if (hasPrevious) {
          mainContent += `I've reviewed your inquiry: "{{previous_message}}"\n\n`;
        }
        mainContent += `I'm here to assist you with whatever you need.`;
      }
  }

  const closingPart = hasSender
    ? `\n\nBest regards,\n{{sender_name}}`
    : `\n\nBest regards`;

  return greetingPart + mainContent + closingPart;
}
