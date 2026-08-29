import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Find all variations that are scheduled and whose time has arrived
    const now = new Date().toISOString();
    const { data: dueVariations, error } = await supabase
      .from("instagram_post_variations")
      .select("*")
      .eq("status", "scheduled")
      .not("scheduled_for", "is", null)
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (error) throw error;

    if (!dueVariations || dueVariations.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const variation of dueVariations) {
      // Check the account's schedule to see if we're within the allowed time window
      const { data: schedule } = await supabase
        .from("instagram_posting_schedules")
        .select("auto_posting_enabled, start_time, end_time, active_days, min_gap_minutes")
        .eq("account_id", variation.account_id)
        .maybeSingle();

      if (schedule && !schedule.auto_posting_enabled) {
        continue;
      }

      // Check if today is an active day
      if (schedule && schedule.active_days) {
        const today = new Date().getDay();
        if (!schedule.active_days.includes(today)) {
          continue;
        }
      }

      // Check if within time window
      if (schedule && schedule.start_time && schedule.end_time) {
        const currentTime = new Date().toTimeString().slice(0, 5);
        const startTime = schedule.start_time.slice(0, 5);
        const endTime = schedule.end_time.slice(0, 5);
        if (currentTime < startTime || currentTime > endTime) {
          continue;
        }
      }

      // Check minimum gap between posts for this account
      if (schedule && schedule.min_gap_minutes) {
        const { data: lastPost } = await supabase
          .from("instagram_post_variations")
          .select("updated_at")
          .eq("account_id", variation.account_id)
          .eq("status", "published")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastPost) {
          const lastPostTime = new Date(lastPost.updated_at);
          const minutesSinceLastPost = (Date.now() - lastPostTime.getTime()) / (1000 * 60);
          if (minutesSinceLastPost < schedule.min_gap_minutes) {
            continue;
          }
        }
      }

      // Check retry limit
      if (variation.retry_count >= 3) {
        await supabase
          .from("instagram_post_variations")
          .update({
            status: 'failed',
            error_message: 'Max retries exceeded',
            updated_at: new Date().toISOString(),
          })
          .eq("id", variation.id);
        failed++;
        continue;
      }

      // Publish the post
      try {
        const publishResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-instagram-post`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              variation_id: variation.id,
              action: 'publish',
            }),
          },
        );

        if (publishResponse.ok) {
          processed++;
        } else {
          // Increment retry count
          await supabase
            .from("instagram_post_variations")
            .update({
              retry_count: variation.retry_count + 1,
              error_message: `Publish attempt failed: ${publishResponse.status}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", variation.id);
          failed++;
        }
      } catch (e) {
        console.error(`Failed to publish variation ${variation.id}:`, e);
        await supabase
          .from("instagram_post_variations")
          .update({
            retry_count: variation.retry_count + 1,
            error_message: e.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", variation.id);
        failed++;
      }

      // Rate limit: wait between posts
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return new Response(JSON.stringify({
      success: true,
      processed: processed,
      failed: failed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-instagram-queue error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
