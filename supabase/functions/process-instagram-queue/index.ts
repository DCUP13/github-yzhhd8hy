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
      if (variation.retry_count >= 3) {
        await supabase.from("instagram_post_variations")
          .update({ status: 'failed', error_message: 'Max retries exceeded', updated_at: new Date().toISOString() })
          .eq("id", variation.id);
        failed++;
        continue;
      }

      try {
        const publishResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-instagram-post`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variation_id: variation.id, action: 'publish' }),
          },
        );

        if (publishResponse.ok) {
          processed++;
        } else {
          await supabase.from("instagram_post_variations")
            .update({ retry_count: variation.retry_count + 1, error_message: `Publish attempt failed: ${publishResponse.status}`, updated_at: new Date().toISOString() })
            .eq("id", variation.id);
          failed++;
        }
      } catch (e) {
        console.error(`Failed to publish variation ${variation.id}:`, e);
        await supabase.from("instagram_post_variations")
          .update({ retry_count: variation.retry_count + 1, error_message: e.message, updated_at: new Date().toISOString() })
          .eq("id", variation.id);
        failed++;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return new Response(JSON.stringify({ success: true, processed, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-instagram-queue error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
