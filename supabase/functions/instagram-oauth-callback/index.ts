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
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    // Determine the app's frontend URL for redirect
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;

    // Build a redirect back to the app's Instagram settings page
    // We use the origin from the request referer or fall back to a generic app URL
    const referer = req.headers.get("referer") ?? "";
    let appOrigin = "";
    try {
      if (referer) {
        const refererUrl = new URL(referer);
        appOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      }
    } catch {
      // ignore
    }
    if (!appOrigin) {
      // Fall back to the supabase project URL's host (unlikely to be the app)
      appOrigin = supabaseUrl;
    }

    const settingsUrl = `${appOrigin}/app/instagram?tab=sharing&oauth=done`;

    if (errorParam) {
      return Response.redirect(`${settingsUrl}&oauth_error=${encodeURIComponent(errorParam)}`, 302);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${settingsUrl}&oauth_error=missing_params`, 302);
    }

    // Parse state to get user_id
    let stateData: { user_id: string; ts: number };
    try {
      stateData = JSON.parse(atob(stateParam));
    } catch {
      return Response.redirect(`${settingsUrl}&oauth_error=invalid_state`, 302);
    }

    const userId = stateData.user_id;
    if (!userId) {
      return Response.redirect(`${settingsUrl}&oauth_error=no_user`, 302);
    }

    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");

    if (!appId || !appSecret) {
      return Response.redirect(`${settingsUrl}&oauth_error=not_configured`, 302);
    }

    // Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      return Response.redirect(`${settingsUrl}&oauth_error=${encodeURIComponent("token_exchange_failed")}`, 302);
    }

    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;

    if (!shortLivedToken) {
      return Response.redirect(`${settingsUrl}&oauth_error=no_token`, 302);
    }

    // Exchange for long-lived token
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const longLivedRes = await fetch(longLivedUrl);

    if (!longLivedRes.ok) {
      return Response.redirect(`${settingsUrl}&oauth_error=long_lived_failed`, 302);
    }

    const longLivedData = await longLivedRes.json();
    const longLivedToken = longLivedData.access_token;

    if (!longLivedToken) {
      return Response.redirect(`${settingsUrl}&oauth_error=no_long_token`, 302);
    }

    // Get the user's Pages
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&access_token=${longLivedToken}`;
    const pagesRes = await fetch(pagesUrl);

    if (!pagesRes.ok) {
      return Response.redirect(`${settingsUrl}&oauth_error=pages_failed`, 302);
    }

    const pagesData = await pagesRes.json();
    const pages: any[] = pagesData.data ?? [];

    if (pages.length === 0) {
      return Response.redirect(`${settingsUrl}&oauth_error=no_pages`, 302);
    }

    // Get the Instagram Business Account from the first Page
    let igUserId: string | null = null;
    let igUsername: string | null = null;
    let igProfilePic: string | null = null;

    for (const page of pages) {
      const igUrl = `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
      const igRes = await fetch(igUrl);
      if (igRes.ok) {
        const igBody = await igRes.json();
        if (igBody.instagram_business_account?.id) {
          igUserId = igBody.instagram_business_account.id;
          // Fetch profile data
          const profileUrl = `https://graph.facebook.com/v21.0/${igUserId}?fields=username,profile_picture_url,followers_count,follows_count,media_count&access_token=${page.access_token}`;
          const profileRes = await fetch(profileUrl);
          if (profileRes.ok) {
            const profile = await profileRes.json();
            igUsername = profile.username ?? null;
            igProfilePic = profile.profile_picture_url ?? null;
          }
          break;
        }
      }
    }

    if (!igUserId) {
      return Response.redirect(`${settingsUrl}&oauth_error=no_ig_account`, 302);
    }

    // Save to database — upsert the account
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Check if this account already exists for this user
    const { data: existing } = await supabaseClient
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("ig_user_id", igUserId)
      .maybeSingle();

    const payload = {
      user_id: userId,
      ig_user_id: igUserId,
      username: igUsername,
      access_token: longLivedToken,
      connected: true,
      auth_method: "oauth",
      profile_picture_url: igProfilePic,
      token_expired: false,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabaseClient
        .from("instagram_accounts")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await supabaseClient
        .from("instagram_accounts")
        .insert(payload);
    }

    return Response.redirect(`${settingsUrl}&oauth=success`, 302);
  } catch (error) {
    console.error("OAuth callback error:", error);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    return Response.redirect(`${supabaseUrl}/app/instagram?tab=sharing&oauth_error=${encodeURIComponent(error.message)}`, 302);
  }
});
