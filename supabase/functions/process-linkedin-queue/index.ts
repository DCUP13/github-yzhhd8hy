import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    // Find all posts scheduled for now or earlier that haven't been published
    const now = new Date().toISOString();
    const { data: scheduledPosts, error } = await supabase
      .from("linkedin_posts")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Error fetching scheduled LinkedIn posts:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let published = 0;
    let failed = 0;

    for (const post of scheduledPosts) {
      try {
        const publishRes = await fetch(`${supabaseUrl}/functions/v1/publish-linkedin-post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ post_id: post.id }),
        });

        if (publishRes.ok) {
          published++;
        } else {
          const errText = await publishRes.text();
          console.error(`Failed to publish LinkedIn post ${post.id}:`, errText);
          failed++;
        }
      } catch (e) {
        console.error(`Error publishing LinkedIn post ${post.id}:`, e);
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed: scheduledPosts.length, published, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-linkedin-queue error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
