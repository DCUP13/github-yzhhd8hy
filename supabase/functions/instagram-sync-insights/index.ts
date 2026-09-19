import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GraphApiError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
}

function cleanToken(raw: string): string {
  return raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function isTokenInvalidError(body: GraphApiError): boolean {
  const code = body.error?.code;
  // Code 100 = "Object does not exist" — this is a permissions/object issue, NOT a token issue
  return code === 190 || code === 102 || code === 200 || code === 463 || code === 467;
}

function isProfileNotFoundError(body: GraphApiError): boolean {
  return body.error?.code === 100;
}

function graphUrl(base: string, accessToken: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}access_token=${encodeURIComponent(accessToken)}`;
}

function isInstagramToken(token: string): boolean {
  return token.startsWith("IGA");
}

function apiBase(token: string): string {
  return isInstagramToken(token) ? "https://graph.instagram.com" : "https://graph.facebook.com";
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

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

    const accessToken = cleanToken(account.access_token);
    const igUserId = account.ig_user_id.trim();

    if (!accessToken) {
      await supabaseClient
        .from("instagram_accounts")
        .update({ token_expired: true })
        .eq("id", accountId);
      return new Response(JSON.stringify({ error: "Access token is empty after cleaning. Please re-enter a valid token." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const markTokenExpired = async () => {
      await supabaseClient
        .from("instagram_accounts")
        .update({ token_expired: true, connected: false, updated_at: new Date().toISOString() })
        .eq("id", accountId);
    };

    // 1. Fetch account-level data from Graph API
    // Instagram tokens (IGA...) use graph.instagram.com with Bearer header.
    // Facebook/Page tokens use graph.facebook.com with access_token query param.
    // Try the user ID first, then fall back to /me if the profile can't be found.
    const baseUrl = apiBase(accessToken);

    // Parse profile response as text, then extract id as string to preserve precision
    // Instagram user IDs can exceed Number.MAX_SAFE_INTEGER, so JSON.parse() corrupts them
    function extractStringId(text: string): string | undefined {
      const match = text.match(/"id"\s*:\s*(?:"([^"]+)"|(\d+))/);
      return match?.[1] ?? match?.[2];
    }

    async function fetchProfile(userIdParam: string): Promise<{ ok: boolean; status: number; body: any; rawText: string }> {
      const fields = "fields=username,profile_picture_url,followers_count,follows_count,media_count";
      let res: Response;
      if (isInstagramToken(accessToken)) {
        res = await fetch(`${baseUrl}/v21.0/${userIdParam}?${fields}`, { headers: authHeaders(accessToken) });
      } else {
        res = await fetch(graphUrl(`${baseUrl}/v21.0/${userIdParam}?${fields}`, accessToken));
      }
      const rawText = await res.text();
      const body = rawText ? JSON.parse(rawText) : {};
      return { ok: res.ok, status: res.status, body, rawText };
    }

    let profileRes = await fetchProfile(igUserId);

    // If profile fetch by user_id fails with code 100, try /me as fallback
    if (!profileRes.ok && isProfileNotFoundError(profileRes.body)) {
      console.log("Profile fetch by user_id failed, trying /me fallback");
      const meRes = await fetchProfile("me");
      if (meRes.ok) {
        profileRes = meRes;
        // Update the ig_user_id in the database if /me returns a different id
        const meId = extractStringId(meRes.rawText);
        if (meId && meId !== igUserId) {
          console.log("Updating ig_user_id from", igUserId, "to", meId);
          await supabaseClient
            .from("instagram_accounts")
            .update({ ig_user_id: meId, updated_at: new Date().toISOString() })
            .eq("id", accountId);
        }
      }
    }

    if (!profileRes.ok) {
      const errBody: GraphApiError = profileRes.body;
      const errMsg = errBody.error?.message ?? `HTTP ${profileRes.status}`;

      if (isTokenInvalidError(errBody) || profileRes.status === 401 || profileRes.status === 403) {
        await markTokenExpired();
        return new Response(JSON.stringify({
          error: `Your Instagram access token is invalid or expired. Please reconnect the account or update the token in Settings.`,
          token_expired: true,
        }), {
          status: profileRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: `Graph API error: ${errMsg}` }), {
        status: profileRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profile = profileRes.body;
    const effectiveUserId = extractStringId(profileRes.rawText) ?? igUserId;

    // 2. Fetch recent media — paginate to get all posts
    let mediaItems: any[] = [];
    let nextUrl: string | null = `${baseUrl}/v21.0/${effectiveUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=100`;
    let pageCount = 0;
    while (nextUrl && pageCount < 5) {
      let pageRes: Response;
      if (isInstagramToken(accessToken)) {
        pageRes = await fetch(nextUrl, { headers: authHeaders(accessToken) });
      } else {
        pageRes = await fetch(graphUrl(nextUrl, accessToken));
      }
      if (!pageRes.ok) break;
      const pageData = await pageRes.json();
      mediaItems.push(...(pageData.data ?? []));
      nextUrl = pageData.paging?.next ?? null;
      pageCount++;
    }

    // 3. Fetch insights for each media item
    const postsData: any[] = [];
    let totalReach = 0;
    let totalImpressions = 0;
    let totalEngagement = 0;

    for (const item of mediaItems) {
      let reach: number | null = null;
      let impressions: number | null = null;
      let saved: number | null = null;
      let videoViews: number | null = null;

      // Fetch carousel children if this is a carousel post
      let carouselUrls: string[] | null = null;
      if (item.media_type === "CAROUSEL" || item.media_type === "CAROUSEL_ALBUM") {
        try {
          let childrenRes: Response;
          if (isInstagramToken(accessToken)) {
            childrenRes = await fetch(
              `${baseUrl}/v21.0/${item.id}/children?fields=id,media_type,media_url,thumbnail_url&limit=20`,
              { headers: authHeaders(accessToken) },
            );
          } else {
            childrenRes = await fetch(
              graphUrl(
                `${baseUrl}/v21.0/${item.id}/children?fields=id,media_type,media_url,thumbnail_url&limit=20`,
                accessToken,
              ),
            );
          }
          if (childrenRes.ok) {
            const childrenBody = await childrenRes.json();
            const children: any[] = childrenBody.data ?? [];
            carouselUrls = children.map((c: any) =>
              c.media_type === "VIDEO" || c.media_type === "REEL"
                ? (c.thumbnail_url ?? c.media_url ?? null)
                : (c.media_url ?? null)
            ).filter((url: string | null): url is string => url != null);
          }
        } catch {
          // Carousel children fetch may fail; continue with single image
        }
      }

      try {
        let insightsRes: Response;
        if (isInstagramToken(accessToken)) {
          insightsRes = await fetch(
            `${baseUrl}/v21.0/${item.id}/insights?metric=reach,impressions,saved,video_views`,
            { headers: authHeaders(accessToken) },
          );
        } else {
          insightsRes = await fetch(
            graphUrl(
              `${baseUrl}/v21.0/${item.id}/insights?metric=reach,impressions,saved,video_views`,
              accessToken,
            ),
          );
        }
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
        carousel_urls: carouselUrls,
        like_count: likeCount,
        comments_count: commentsCount,
        reach,
        impressions,
        saved,
        video_views: videoViews,
        timestamp: item.timestamp ?? null,
      });
    }

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

    // 5. Update account with latest profile data and clean token
    await supabaseClient
      .from("instagram_accounts")
      .update({
        username: profile.username ?? account.username,
        profile_picture_url: profile.profile_picture_url ?? null,
        followers_count: profile.followers_count ?? null,
        follows_count: profile.follows_count ?? null,
        media_count: profile.media_count ?? null,
        access_token: accessToken,
        token_expired: false,
        connected: true,
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

    // 7. Pull comments from Instagram for posts that have them, so the feed
    //    shows actual comment text — not just the count from the snapshot.
    //    We only insert comments that aren't already in instagram_webhook_events
    //    (deduplicated by event_id = comment_id).
    let commentsSynced = 0;
    const igPageScopedId = account.page_scoped_id ?? effectiveUserId;

    for (const item of mediaItems) {
      const commentsCount = item.comments_count ?? 0;
      if (commentsCount === 0) continue;

      try {
        let commentsRes: Response;
        const commentsUrl = `${baseUrl}/v21.0/${item.id}/comments?fields=id,text,from,timestamp,parent_id&limit=50`;
        if (isInstagramToken(accessToken)) {
          commentsRes = await fetch(commentsUrl, { headers: authHeaders(accessToken) });
        } else {
          commentsRes = await fetch(graphUrl(commentsUrl, accessToken));
        }
        if (!commentsRes.ok) continue;
        const commentsBody = await commentsRes.json();
        const comments: any[] = commentsBody.data ?? [];
        if (comments.length === 0) continue;

        // Fetch media meta once for this post so stored events have full context
        const mediaMeta = {
          media_type: item.media_type ?? null,
          permalink: item.permalink ?? null,
          caption: (item.caption ?? "").substring(0, 500),
          media_image_url: item.thumbnail_url ?? item.media_url ?? null,
        };

        // Collect all comment IDs to check which ones already exist
        const commentIds = comments.map((c: any) => c.id).filter(Boolean);
        let existingIds = new Set<string>();
        if (commentIds.length > 0) {
          const { data: existing } = await supabaseClient
            .from("instagram_webhook_events")
            .select("event_id")
            .in("event_id", commentIds)
            .eq("event_type", "comment");
          if (existing) {
            for (const row of existing) {
              if (row.event_id) existingIds.add(row.event_id);
            }
          }
        }

        const newRows: any[] = [];
        for (const c of comments) {
          if (!c.id || existingIds.has(c.id)) continue;
          newRows.push({
            user_id: account.user_id,
            event_id: c.id,
            event_type: "comment",
            ig_user_id: igPageScopedId,
            sender_id: c.from?.id ?? null,
            sender_username: c.from?.username ?? null,
            sender_name: null,
            sender_profile_url: null,
            media_id: item.id,
            media_type: mediaMeta.media_type,
            media_permalink: mediaMeta.permalink,
            media_caption: mediaMeta.caption,
            media_image_url: mediaMeta.media_image_url,
            comment_id: c.id,
            message_text: c.text ?? null,
            direction: "incoming",
            recipient_id: null,
            raw_event: { synced_from_insights: true, comment: c },
            parent_comment_id: c.parent_id ?? null,
          });
        }

        if (newRows.length > 0) {
          const { error: insertError } = await supabaseClient
            .from("instagram_webhook_events")
            .insert(newRows);
          if (insertError) {
            console.error("Error inserting synced comments:", insertError);
          } else {
            commentsSynced += newRows.length;
          }
        }
      } catch (err) {
        console.error(`Error fetching comments for media ${item.id}:`, err);
      }
    }

    if (commentsSynced > 0) {
      console.log(`Synced ${commentsSynced} new comments from Instagram`);
    }

    // 8. Sync feed: update published variations with real Instagram data, remove deleted posts
    const liveMediaIds = new Set(mediaItems.map((m: any) => m.id));

    // Fetch all published variations for this account
    const { data: publishedVariations } = await supabaseClient
      .from("instagram_post_variations")
      .select("id, ig_media_id, account_id")
      .eq("user_id", account.user_id)
      .eq("status", "published")
      .eq("account_id", accountId);

    const toDelete: string[] = [];
    const toUpdate: Array<{ id: string; permalink: string | null; caption: string; media_image_url: string | null; media_type: string | null }> = [];

    if (publishedVariations) {
      for (const v of publishedVariations) {
        if (!v.ig_media_id) continue;
        const livePost = mediaItems.find((m: any) => m.id === v.ig_media_id);
        if (!livePost) {
          // Post no longer exists on Instagram — mark for deletion
          toDelete.push(v.id);
        } else {
          // Update with real Instagram data
          const imageUrl = livePost.media_type === "VIDEO" || livePost.media_type === "REEL"
            ? (livePost.thumbnail_url ?? livePost.media_url ?? null)
            : (livePost.media_url ?? null);
          toUpdate.push({
            id: v.id,
            permalink: livePost.permalink ?? null,
            caption: (livePost.caption ?? "").substring(0, 500),
            media_image_url: imageUrl,
            media_type: livePost.media_type ?? null,
          });
        }
      }

      // Delete variations whose posts are gone from Instagram
      if (toDelete.length > 0) {
        await supabaseClient
          .from("instagram_post_variations")
          .delete()
          .in("id", toDelete);
      }

      // Update variations with fresh Instagram data
      for (const u of toUpdate) {
        await supabaseClient
          .from("instagram_post_variations")
          .update({
            permalink: u.permalink,
            caption: u.caption,
            media_image_url: u.media_image_url,
            media_type: u.media_type,
            updated_at: new Date().toISOString(),
          })
          .eq("id", u.id);
      }
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
      feed_sync: {
        updated: toUpdate.length,
        removed: toDelete.length,
        comments_synced: commentsSynced,
      },
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
