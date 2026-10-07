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
    const { user_id, account_id } = await req.json().catch(() => ({} as { user_id?: string; account_id?: string }));

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the LinkedIn account
    let query = supabase.from("linkedin_accounts").select("*").eq("user_id", user_id);
    if (account_id) {
      query = query.eq("id", account_id);
    }
    const { data: accounts, error: acctError } = await query;

    if (acctError || !accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ error: "No LinkedIn accounts found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSynced = 0;
    const allSnapshots: Array<Record<string, unknown>> = [];

    for (const account of accounts) {
      if (!account.connected || !account.access_token || !account.person_urn) continue;

      const accessToken = account.access_token as string;
      const personUrn = account.person_urn as string;
      const accountId = account.id as string;

      const headers = {
        "Authorization": `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      };

      // 1. Fetch the user's UGC posts
      let postUrns: string[] = [];
      try {
        const postsUrl = `https://api.linkedin.com/rest/posts?author=${encodeURIComponent(personUrn)}&isDistributed=false&count=50&sortBy=LAST_MODIFIED`;
        const postsRes = await fetch(postsUrl, {
          headers: {
            ...headers,
            "Linkedin-Version": "202401",
          },
        });

        if (postsRes.ok) {
          const postsData = await postsRes.json();
          const posts = postsData.elements || postsData.value || [];
          for (const post of posts) {
            const urn = post.id || post.urn || post["$id"] || "";
            if (urn) postUrns.push(typeof urn === "string" ? urn : String(urn));
          }
        }
      } catch (e) {
        console.error("Failed to fetch LinkedIn posts:", e);
      }

      // Also fetch from linkedin_posts table to get posts we published
      const { data: publishedPosts } = await supabase
        .from("linkedin_posts")
        .select("linkedin_post_urn, permalink, content_text")
        .eq("user_id", user_id)
        .eq("status", "published")
        .not("linkedin_post_urn", "is", null);

      if (publishedPosts) {
        for (const p of publishedPosts) {
          if (p.linkedin_post_urn && !postUrns.includes(p.linkedin_post_urn)) {
            postUrns.push(p.linkedin_post_urn);
          }
        }
      }

      // 2. For each post, fetch analytics
      for (const postUrn of postUrns) {
        let impressions: number | null = null;
        let uniqueImpressions: number | null = null;
        let likes: number | null = null;
        let comments: number | null = null;
        let shares: number | null = null;
        let reactionsTotal: number | null = null;
        let clicks: number | null = null;
        let videoViews: number | null = null;
        let permalink: string | null = null;
        let postContent: string | null = null;

        // Fetch post statistics via the socialActions/socialMetadata endpoint
        try {
          // Try the new posts API for statistics
          const statsUrl = `https://api.linkedin.com/rest/posts/${encodeURIComponent(postUrn)}`;
          const statsRes = await fetch(statsUrl, {
            headers: {
              ...headers,
              "Linkedin-Version": "202401",
            },
          });

          if (statsRes.ok) {
            const postData = await statsRes.json();
            // Extract available metrics from the post object
            if (postData.lifecycleState) { /* post exists */ }
            postContent = (postData.commentary || postData.text || postData.content?.text || "").substring(0, 200);
            if (postData.permalink) permalink = postData.permalink;
          }
        } catch (e) {
          console.error(`Failed to fetch post data for ${postUrn}:`, e);
        }

        // Fetch reactions count
        try {
          const reactionsUrl = `https://api.linkedin.com/v2/reactions?segmentType=OTHER&subject=${encodeURIComponent(postUrn)}&count=1`;
          const reactionsRes = await fetch(reactionsUrl, { headers });
          if (reactionsRes.ok) {
            const reactionsData = await reactionsRes.json();
            // The count is in the paging metadata or elements array
            reactionsTotal = reactionsData.elements?.length ?? null;
            // If there's a total count in paging, use that
            if (reactionsData.paging?.total) {
              reactionsTotal = reactionsData.paging.total;
            }
          }
        } catch (e) {
          console.error(`Failed to fetch reactions for ${postUrn}:`, e);
        }

        // Fetch social metadata (likes, comments, shares, impressions)
        try {
          const socialMetadataUrl = `https://api.linkedin.com/v2/socialMetadata/${encodeURIComponent(postUrn)}`;
          const socialRes = await fetch(socialMetadataUrl, { headers });
          if (socialRes.ok) {
            const socialData = await socialRes.json();
            likes = socialData.likesCount ?? socialData.totalLikes ?? null;
            comments = socialData.commentsCount ?? socialData.totalComments ?? null;
            shares = socialData.sharesCount ?? socialData.totalShares ?? null;
            impressions = socialData.impressionsCount ?? socialData.totalImpressions ?? null;
            uniqueImpressions = socialData.uniqueImpressionsCount ?? socialData.uniqueImpressions ?? null;
            clicks = socialData.clicksCount ?? socialData.totalClicks ?? null;
          }
        } catch (e) {
          console.error(`Failed to fetch social metadata for ${postUrn}:`, e);
        }

        // Fetch comments count via socialActions
        if (comments === null) {
          try {
            const commentsUrl = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments?count=1`;
            const commentsRes = await fetch(commentsUrl, { headers });
            if (commentsRes.ok) {
              const commentsData = await commentsRes.json();
              comments = commentsData.paging?.total ?? commentsData.elements?.length ?? null;
            }
          } catch (e) {
            console.error(`Failed to fetch comments for ${postUrn}:`, e);
          }
        }

        // Fetch likes count via socialActions
        if (likes === null) {
          try {
            const likesUrl = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/likes?count=1`;
            const likesRes = await fetch(likesUrl, { headers });
            if (likesRes.ok) {
              const likesData = await likesRes.json();
              likes = likesData.paging?.total ?? likesData.elements?.length ?? null;
            }
          } catch (e) {
            console.error(`Failed to fetch likes for ${postUrn}:`, e);
          }
        }

        // Try to get permalink from linkedin_posts table
        if (!permalink) {
          const { data: postData } = await supabase
            .from("linkedin_posts")
            .select("permalink, content_text")
            .eq("user_id", user_id)
            .eq("linkedin_post_urn", postUrn)
            .maybeSingle();
          if (postData?.permalink) permalink = postData.permalink;
          if (!postContent && postData?.content_text) postContent = postData.content_text.substring(0, 200);
        }

        // Calculate engagement rate
        const totalEngagement = (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (clicks ?? 0);
        const engagementRate = impressions && impressions > 0
          ? (totalEngagement / impressions) * 100
          : null;

        const snapshot: Record<string, unknown> = {
          user_id,
          account_id: accountId,
          post_urn: postUrn,
          impressions,
          unique_impressions: uniqueImpressions,
          likes,
          comments,
          shares,
          reactions_total: reactionsTotal,
          clicks,
          video_views: videoViews,
          engagement_rate: engagementRate,
          post_permalink: permalink,
          post_content: postContent,
          snapshot_time: new Date().toISOString(),
        };

        allSnapshots.push(snapshot);
        totalSynced++;
      }
    }

    // Batch insert all snapshots
    if (allSnapshots.length > 0) {
      const { error: insertError } = await supabase
        .from("linkedin_analytics_snapshots")
        .insert(allSnapshots);

      if (insertError) {
        console.error("Error inserting LinkedIn analytics snapshots:", insertError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      posts_synced: totalSynced,
      snapshots_created: allSnapshots.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("linkedin-sync-analytics error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
