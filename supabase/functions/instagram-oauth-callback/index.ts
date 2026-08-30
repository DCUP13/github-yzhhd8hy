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
  page_access_token: string;
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

    // Parse state to get user_id and app origin
    let stateData: { user_id: string; ts: number; origin?: string; reconnect_account_id?: string };
    try {
      stateData = JSON.parse(atob(stateParam ?? ""));
    } catch {
      return Response.redirect(`${supabaseUrl}/app/instagram?tab=sharing&oauth=done&oauth_error=invalid_state`, 302);
    }

    const userId = stateData.user_id;
    if (!userId) {
      return Response.redirect(`${supabaseUrl}/app/instagram?tab=sharing&oauth=done&oauth_error=no_user`, 302);
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

    const settingsUrl = `${appOrigin}/app/instagram?tab=sharing&oauth=done`;

    if (errorParam) {
      return Response.redirect(`${settingsUrl}&oauth_error=${encodeURIComponent(errorParam)}`, 302);
    }

    if (!code || !stateParam) {
      return Response.redirect(`${settingsUrl}&oauth_error=missing_params`, 302);
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
      return Response.redirect(`${settingsUrl}&oauth_error=token_exchange_failed`, 302);
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

    // Get ALL the user's Pages (with pagination support)
    const pages: Array<{ id: string; access_token: string }> = [];
    let pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&limit=100&access_token=${longLivedToken}`;

    while (pagesUrl) {
      const pagesRes = await fetch(pagesUrl);
      if (!pagesRes.ok) {
        return Response.redirect(`${settingsUrl}&oauth_error=pages_failed`, 302);
      }
      const pagesData = await pagesRes.json();
      pages.push(...(pagesData.data ?? []));
      pagesUrl = pagesData.paging?.next ?? "";
    }

    if (pages.length === 0) {
      return Response.redirect(`${settingsUrl}&oauth_error=no_pages`, 302);
    }

    // Discover ALL Instagram Business Accounts across ALL Pages
    const igAccounts: IgAccount[] = [];

    for (const page of pages) {
      const igUrl = `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
      const igRes = await fetch(igUrl);
      if (igRes.ok) {
        const igBody = await igRes.json();
        if (igBody.instagram_business_account?.id) {
          const igUserId = igBody.instagram_business_account.id;
          const profileUrl = `https://graph.facebook.com/v21.0/${igUserId}?fields=username,profile_picture_url,followers_count,follows_count,media_count&access_token=${page.access_token}`;
          const profileRes = await fetch(profileUrl);
          let profile: Record<string, unknown> = {};
          if (profileRes.ok) {
            profile = await profileRes.json();
          }
          igAccounts.push({
            ig_user_id: igUserId,
            username: (profile.username as string) ?? "",
            profile_picture_url: (profile.profile_picture_url as string) ?? null,
            followers_count: (profile.followers_count as number) ?? null,
            follows_count: (profile.follows_count as number) ?? null,
            media_count: (profile.media_count as number) ?? null,
            page_access_token: page.access_token,
          });
        }
      }
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // If reconnecting a specific account, find the matching IG account by username
    if (reconnectAccountId) {
      // Load the existing account to get its username
      const { data: existingAccount } = await supabaseClient
        .from("instagram_accounts")
        .select("id, username, ig_user_id")
        .eq("id", reconnectAccountId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingAccount) {
        // Try to find a matching IG account by username
        let match: IgAccount | undefined = igAccounts.find(
          (a) => a.username && existingAccount.username && a.username.toLowerCase() === existingAccount.username.toLowerCase()
        );

        // If no username match, and there's only one IG account found, use it
        if (!match && igAccounts.length === 1) {
          match = igAccounts[0];
        }

        // If no username match but we have multiple IG accounts, pick the one whose ID is already stored
        if (!match && igAccounts.length > 1) {
          match = igAccounts.find((a) => a.ig_user_id === existingAccount.ig_user_id);
        }

        if (match) {
          await supabaseClient
            .from("instagram_accounts")
            .update({
              ig_user_id: match.ig_user_id,
              username: match.username,
              access_token: match.page_access_token,
              connected: true,
              auth_method: "oauth",
              profile_picture_url: match.profile_picture_url,
              followers_count: match.followers_count,
              media_count: match.media_count,
              token_expired: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", reconnectAccountId);
          return Response.redirect(`${settingsUrl}&oauth=success`, 302);
        }

        // No matching IG account found for this username — store the token but mark as needing attention
        await supabaseClient
          .from("instagram_accounts")
          .update({
            access_token: longLivedToken,
            connected: true,
            auth_method: "oauth",
            token_expired: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", reconnectAccountId);
        return Response.redirect(`${settingsUrl}&oauth_error=no_ig_account`, 302);
      }
    }

    // Fresh connect (not reconnecting): store all discovered IG accounts
    if (igAccounts.length === 0) {
      return Response.redirect(`${settingsUrl}&oauth_error=no_ig_account`, 302);
    }

    for (const igAccount of igAccounts) {
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
        access_token: igAccount.page_access_token,
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
    }

    return Response.redirect(`${settingsUrl}&oauth=success`, 302);
  } catch (error) {
    console.error("OAuth callback error:", error);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    return Response.redirect(`${supabaseUrl}/app/instagram?tab=sharing&oauth=done&oauth_error=${encodeURIComponent(error.message)}`, 302);
  }
});
