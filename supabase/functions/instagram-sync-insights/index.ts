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

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let accountId: string | null = null;
    let userId: string | null = null;

    if (req.method === "POST") {
      const body = await req.json();
      accountId = body.account_id ?? null;
      userId = body.user_id ?? null;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      accountId = url.searchParams.get("account_id");
      userId = url.searchParams.get("user_id");
    }

    if (!accountId) {
      return new Response(JSON.stringify({ error: "account_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the account
    const { data: account, error: acctError } = await supabaseClient
      .from("instagram_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (acctError || !account) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!account.access_token || !account.ig_user_id) {
      return new Response(JSON.stringify({ error: "Account not connected or missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = account.access_token;
    const igUserId = account.ig_user_id;

    // 1. Fetch account-level data from Graph API
    const profileUrl = `https://graph.facebook.com/v21.0/${igUserId}?fields=username,profile_picture_url,followers_count,follows_count,media_count&access_token=${accessToken}`;
    const profileRes = await fetch(profileUrl);

    if (!profileRes.ok) {
      const errBody = await profileRes.text();
      // Mark token as expired if we get a 401/403
      if (profileRes.status === 401 || profileRes.status === 403) {
        await supabaseClient
          .from("instagram_accounts")
          .update({ token_expired: true })
          .eq("id", accountId);
      }
      return new Response(JSON.stringify({ error: `Graph API error: ${errBody}` }), {
        status: profileRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profile = await profileRes.json();

    // 2. Fetch recent media (up to 25 posts)
    const mediaUrl = `https://graph.facebook.com/v21.0/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25&access_token=${accessToken}`;
    const mediaRes = await fetch(mediaUrl);
    const mediaData = mediaRes.ok ? await mediaRes.json() : { data: [] };
    const mediaItems: any[] = mediaData.data ?? [];

    // 3. Fetch insights for each media item (reach, impressions, saved, video_views)
    const postsData: any[] = [];
    let totalReach = 0;
    let totalImpressions = 0;
    let totalEngagement = 0;

    for (const item of mediaItems) {
      let reach: number | null = null;
      let impressions: number | null = null;
      let saved: number | null = null;
      let videoViews: number | null = null;

      try {
        const insightsUrl = `https://graph.facebook.com/v21.0/${item.id}/insights?metric=reach,impressions,saved,video_views&access_token=${accessToken}`;
        const insightsRes = await fetch(insightsUrl);
        if (insightsRes.ok) {
          const insightsBody = await insightsRes.json();
          for (const metric of insightsBody.data ?? []) {
            if (metric.name === "reach" && metric.values?.[0]?.value != null) {
              reach = metric.values[0].value;
              totalReach += reach;
            }
            if (metric.name === "impressions" && metric.values?.[0]?.value != null) {
              impressions = metric.values[0].value;
              totalImpressions += impressions;
            }
            if (metric.name === "saved" && metric.values?.[0]?.value != null) {
              saved = metric.values[0].value;
            }
            if (metric.name === "video_views" && metric.values?.[0]?.value != null) {
              videoViews = metric.values[0].value;
            }
          }
        }
      } catch {
        // Insights may not be available for all media types; skip silently
      }

      const likeCount = item.like_count ?? 0;
      const commentsCount = item.comments_count ?? 0;
      totalEngagement += likeCount + commentsCount + (saved ?? 0);

      postsData.push({
        media_id: item.id,
        caption: (item.caption ?? "").substring(0, 200),
        media_type: item.media_type ?? null,
        permalink: item.permalink ?? null,
        thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
        like_count: likeCount,
        comments_count: commentsCount,
        reach,
        impressions,
        saved,
        video_views: videoViews,
        timestamp: item.timestamp ?? null,
      });
    }

    // Calculate engagement rate
    const engagementRate = totalImpressions > 0
      ? Math.round((totalEngagement / totalImpressions) * 10000) / 100
      : 0;

    // 4. Save snapshot
    const { error: snapshotError } = await supabaseClient
      .from("instagram_insights_snapshots")
      .insert({
        account_id: accountId,
        user_id: account.user_id,
        followers_count: profile.followers_count ?? null,
        follows_count: profile.follows_count ?? null,
        media_count: profile.media_count ?? null,
        account_reach: totalReach > 0 ? totalReach : null,
        account_impressions: totalImpressions > 0 ? totalImpressions : null,
        engagement_rate: engagementRate,
        posts_data: postsData,
      });

    if (snapshotError) {
      console.error("Error saving snapshot:", snapshotError);
    }

    // 5. Update account with latest profile data
    await supabaseClient
      .from("instagram_accounts")
      .update({
        username: profile.username ?? account.username,
        profile_picture_url: profile.profile_picture_url ?? null,
        followers_count: profile.followers_count ?? null,
        follows_count: profile.follows_count ?? null,
        media_count: profile.media_count ?? null,
        token_expired: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    // 6. Update last_refresh_at in refresh settings
    if (userId || account.user_id) {
      const uid = userId ?? account.user_id;
      await supabaseClient
        .from("instagram_refresh_settings")
        .upsert({
          user_id: uid,
          last_refresh_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
    }

    return new Response(JSON.stringify({
      success: true,
      account: {
        username: profile.username,
        followers_count: profile.followers_count,
        follows_count: profile.follows_count,
        media_count: profile.media_count,
        profile_picture_url: profile.profile_picture_url,
      },
      snapshot: {
        total_reach: totalReach,
        total_impressions: totalImpressions,
        engagement_rate: engagementRate,
        posts_count: postsData.length,
      },
      posts: postsData,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Instagram sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
