import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface IgAccount {
  ig_user_id: string;
  username: string;
  profile_picture_url: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  access_token: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;

    let stateData: { user_id: string; ts: number; origin?: string; reconnect_account_id?: string };
    try {
      stateData = JSON.parse(atob(stateParam ?? ""));
    } catch {
      return Response.redirect(`${supabaseUrl}/app/settings?oauth_error=invalid_state`, 302);
    }

    const userId = stateData.user_id;
    if (!userId) {
      return Response.redirect(`${supabaseUrl}/app/settings?oauth_error=no_user`, 302);
    }

    const reconnectAccountId = stateData.reconnect_account_id || "";

    let appOrigin = stateData.origin || "";
    if (!appOrigin) {
      const referer = req.headers.get("referer") ?? "";
      try {
        if (referer) {
          const refererUrl = new URL(referer);
          appOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
        }
      } catch { /* ignore */ }
    }
    if (!appOrigin) {
      appOrigin = supabaseUrl;
    }

    const settingsBase = `${appOrigin}/app/settings`;
    const settingsUrl = (suffix: string) => `${settingsBase}?${suffix}`;

    if (errorParam) {
      const errorReason = url.searchParams.get("error_reason") ?? errorParam;
      const errorDesc = url.searchParams.get("error_description") ?? "";
      const detail = errorDesc ? `${errorParam}:${errorDesc}` : errorReason;
      return Response.redirect(settingsUrl(`oauth_error=${encodeURIComponent(detail)}`), 302);
    }

    if (!code || !stateParam) {
      return Response.redirect(settingsUrl(`oauth_error=missing_params`), 302);
    }

    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");

    if (!appId || !appSecret) {
      return Response.redirect(settingsUrl(`oauth_error=not_configured`), 302);
    }

    // Exchange code for a short-lived access token via Facebook's Graph API
    // (required for Meta apps — Instagram's direct endpoint doesn't work)
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
      { method: "GET" }
    );

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return Response.redirect(settingsUrl(`oauth_error=token_exchange_failed`), 302);
    }

    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;

    if (!shortLivedToken) {
      return Response.redirect(settingsUrl(`oauth_error=no_token`), 302);
    }

    console.log("Short-lived token obtained, exchanging for long-lived Instagram token...");

    // Exchange for long-lived Instagram access token (60 days)
    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;
    const longLivedRes = await fetch(longLivedUrl);

    if (!longLivedRes.ok) {
      const errText = await longLivedRes.text();
      console.error("Long-lived token exchange failed:", errText);
      return Response.redirect(settingsUrl(`oauth_error=long_lived_failed`), 302);
    }

    const longLivedData = await longLivedRes.json();
    const longLivedToken = longLivedData.access_token;

    if (!longLivedToken) {
      return Response.redirect(settingsUrl(`oauth_error=no_long_token`), 302);
    }

    console.log("Long-lived token obtained, expires in:", longLivedData.expires_in, "seconds");

    // Get the Instagram user ID from the long-lived token
    const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${longLivedToken}`);
    let igUserId = "";
    let username = "";

    if (meRes.ok) {
      const meData = await meRes.json();
      igUserId = meData.id;
      username = meData.username;
      console.log("IG user:", igUserId, username);
    } else {
      const meErr = await meRes.text();
      console.error("Failed to get IG user info:", meErr);
      return Response.redirect(settingsUrl(`oauth_error=no_ig_account`), 302);
    }

    // Fetch the user's profile info
    const profileRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}?fields=username,profile_picture_url,followers_count,follows_count,media_count&access_token=${longLivedToken}`
    );

    let profile: Record<string, unknown> = {};
    if (profileRes.ok) {
      profile = await profileRes.json();
      console.log("Profile fetched:", profile.username, "followers:", profile.followers_count);
    } else {
      const profileErr = await profileRes.text();
      console.error("Profile fetch failed:", profileErr);
    }

    const igAccount: IgAccount = {
      ig_user_id: String(igUserId),
      username: (profile.username as string) ?? username ?? "",
      profile_picture_url: (profile.profile_picture_url as string) ?? null,
      followers_count: (profile.followers_count as number) ?? null,
      follows_count: (profile.follows_count as number) ?? null,
      media_count: (profile.media_count as number) ?? null,
      access_token: longLivedToken,
    };

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // If reconnecting a specific account, update it
    if (reconnectAccountId) {
      const { data: existingAccount } = await supabaseClient
        .from("instagram_accounts")
        .select("id, username, ig_user_id")
        .eq("id", reconnectAccountId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingAccount) {
        await supabaseClient
          .from("instagram_accounts")
          .update({
            ig_user_id: igAccount.ig_user_id,
            username: igAccount.username || existingAccount.username,
            access_token: igAccount.access_token,
            connected: true,
            auth_method: "oauth",
            profile_picture_url: igAccount.profile_picture_url,
            followers_count: igAccount.followers_count,
            media_count: igAccount.media_count,
            token_expired: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", reconnectAccountId);
        return Response.redirect(settingsUrl(`oauth=success`), 302);
      }
    }

    // Fresh connect: upsert the account
    const { data: existing } = await supabaseClient
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("ig_user_id", igAccount.ig_user_id)
      .maybeSingle();

    const payload = {
      user_id: userId,
      ig_user_id: igAccount.ig_user_id,
      username: igAccount.username,
      access_token: igAccount.access_token,
      connected: true,
      auth_method: "oauth",
      profile_picture_url: igAccount.profile_picture_url,
      followers_count: igAccount.followers_count,
      media_count: igAccount.media_count,
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

    return Response.redirect(settingsUrl(`oauth=success`), 302);
  } catch (error) {
    console.error("OAuth callback error:", error);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    return Response.redirect(`${supabaseUrl}/app/settings?oauth_error=${encodeURIComponent(error.message)}`, 302);
  }
});
