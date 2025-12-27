import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProcessOutboxRequest {
  user_id: string;
  limit?: number;
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

    const { user_id, limit = 50 }: ProcessOutboxRequest = await req.json();

    if (!user_id) {
      throw new Error("Missing user_id");
    }

    console.log(`Processing outbox for user: ${user_id}`);

    // Get pending emails from outbox
    const { data: pendingEmails, error: emailsError } = await supabase
      .from("email_outbox")
      .select("*")
      .eq("user_id", user_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (emailsError) {
      throw new Error(`Failed to get pending emails: ${emailsError.message}`);
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending emails to process",
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

    console.log(`Found ${pendingEmails.length} pending emails`);

    // Process each email by calling send-email edge function
    let successCount = 0;
    let failureCount = 0;

    for (const email of pendingEmails) {
      try {
        // Mark as sending
        await supabase
          .from("email_outbox")
          .update({ status: 'sending' })
          .eq("id", email.id);

        // Call send-email edge function
        const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
        const sendResponse = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            to: email.to_email,
            from: email.from_email,
            subject: email.subject,
            html: email.body,
            attachments: email.attachments,
          }),
        });

        const sendResult = await sendResponse.json();

        if (sendResult.success) {
          // Move to sent emails and remove from outbox
          await supabase
            .from("email_sent")
            .insert({
              user_id: email.user_id,
              to_email: email.to_email,
              from_email: email.from_email,
              subject: email.subject,
              body: email.body,
              attachments: email.attachments,
              reply_to_id: email.reply_to_id,
            });

          await supabase
            .from("email_outbox")
            .delete()
            .eq("id", email.id);

          successCount++;
          console.log(`Successfully sent email ${email.id}`);
        } else {
          // Mark as failed
          await supabase
            .from("email_outbox")
            .update({
              status: 'failed',
              error_message: sendResult.error || 'Unknown error',
            })
            .eq("id", email.id);

          failureCount++;
          console.error(`Failed to send email ${email.id}:`, sendResult.error);
        }

        // Rate limiting - wait 1 second between emails
        await new Promise((resolve) => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
        
        // Mark as failed
        await supabase
          .from("email_outbox")
          .update({
            status: 'failed',
            error_message: error.message,
          })
          .eq("id", email.id);

        failureCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingEmails.length,
        successful: successCount,
        failed: failureCount,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in process-outbox:", error);
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