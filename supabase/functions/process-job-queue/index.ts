import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProcessQueueRequest {
  user_id?: string;
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

    const body = await req.json().catch(() => ({}));
    const { user_id, limit = 10 }: ProcessQueueRequest = body;

    console.log(`Processing job queue${user_id ? ` for user ${user_id}` : ''}`);

    // Get pending jobs
    let query = supabase
      .from("job_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    const { data: jobs, error: jobsError } = await query;

    if (jobsError) {
      throw new Error(`Failed to get pending jobs: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending jobs to process",
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

    console.log(`Found ${jobs.length} pending jobs`);

    let successCount = 0;
    let failureCount = 0;

    for (const job of jobs) {
      try {
        // Mark as processing
        await supabase
          .from("job_queue")
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        let result;
        const baseUrl = Deno.env.get("SUPABASE_URL");
        const authHeader = `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;

        // Process based on job type
        switch (job.job_type) {
          case 'process_campaign':
            console.log(`Processing campaign job: ${job.id}`);
            const campaignResponse = await fetch(
              `${baseUrl}/functions/v1/process-campaign`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": authHeader,
                },
                body: JSON.stringify(job.payload),
              }
            );
            result = await campaignResponse.json();
            break;

          case 'scrape_agents':
            console.log(`Processing scrape agents job: ${job.id}`);
            const scrapeResponse = await fetch(
              `${baseUrl}/functions/v1/scrape-agents`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": authHeader,
                },
                body: JSON.stringify(job.payload),
              }
            );
            result = await scrapeResponse.json();
            break;

          case 'process_outbox':
            console.log(`Processing outbox job: ${job.id}`);
            const outboxResponse = await fetch(
              `${baseUrl}/functions/v1/process-outbox`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": authHeader,
                },
                body: JSON.stringify(job.payload),
              }
            );
            result = await outboxResponse.json();
            break;

          default:
            throw new Error(`Unknown job type: ${job.job_type}`);
        }

        if (result && result.success) {
          // Mark as completed
          await supabase
            .from("job_queue")
            .update({
              status: 'completed',
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          successCount++;
          console.log(`Successfully completed job ${job.id}`);
        } else {
          // Mark as failed
          await supabase
            .from("job_queue")
            .update({
              status: 'failed',
              error_message: result?.error || 'Unknown error',
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          failureCount++;
          console.error(`Failed to process job ${job.id}:`, result?.error);
        }

        // Rate limiting - wait 500ms between jobs
        await new Promise((resolve) => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        
        // Mark as failed
        await supabase
          .from("job_queue")
          .update({
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        failureCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: jobs.length,
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
    console.error("Error in process-job-queue:", error);
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