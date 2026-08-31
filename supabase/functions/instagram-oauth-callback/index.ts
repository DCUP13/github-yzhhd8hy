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
      return Response.redirect(settingsUrl(`oauth_error=${encodeURIComponent(errorParam)}`), 302);
    }

    if (!code || !stateParam) {
      return Response.redirect(settingsUrl(`oauth_error=missing_params`), 302);
    }

    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");

    if (!appId || !appSecret) {
      return Response.redirect(settingsUrl(`oauth_error=not_configured`), 302);
    }

    // Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);

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

    // Exchange for long-lived token
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
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

    // Debug: check what permissions were actually granted
    const permsRes = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`);
    let grantedPerms: string[] = [];
    if (permsRes.ok) {
      const permsData = await permsRes.json();
      grantedPerms = (permsData.data ?? []).map((p: { permission: string; status: string }) => p.permission);
    }
    console.log("Granted permissions:", grantedPerms);

    // Debug: who is the authenticated user?
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${longLivedToken}`);
    let meInfo = "";
    if (meRes.ok) {
      const meData = await meRes.json();
      meInfo = `${meData.name} (id: ${meData.id})`;
      console.log("Authenticated FB user:", meInfo);
    }

    // Try fetching pages with BOTH tokens — the long-lived exchange can sometimes lose page access
    // First try short-lived token
    const shortPagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token,name&limit=100&access_token=${shortLivedToken}`);
    const shortPagesRaw = await shortPagesRes.text();
    console.log("Short-lived token me/accounts status:", shortPagesRes.status, "body:", shortPagesRaw);

    let pages: Array<{ id: string; access_token: string; name?: string }> = [];

    if (shortPagesRes.ok) {
      try {
        const shortPagesData = JSON.parse(shortPagesRaw);
        pages.push(...(shortPagesData.data ?? []));
        let nextUrl = shortPagesData.paging?.next ?? "";
        while (nextUrl) {
          const nextRes = await fetch(nextUrl);
          if (nextRes.ok) {
            const nextData = await nextRes.json();
            pages.push(...(nextData.data ?? []));
            nextUrl = nextData.paging?.next ?? "";
          } else {
            break;
          }
        }
      } catch { /* parse error handled below */ }
    }

    console.log(`Short-lived token found ${pages.length} pages`);

    // If short-lived token returned no pages, try long-lived token
    if (pages.length === 0) {
      const longPagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token,name&limit=100&access_token=${longLivedToken}`);
      const longPagesRaw = await longPagesRes.text();
      console.log("Long-lived token me/accounts status:", longPagesRes.status, "body:", longPagesRaw);

      if (!longPagesRes.ok) {
        console.error("Pages fetch failed with both tokens");
        return Response.redirect(settingsUrl(`oauth_error=pages_failed`), 302);
      }
      try {
        const longPagesData = JSON.parse(longPagesRaw);
        pages.push(...(longPagesData.data ?? []));
        let nextUrl = longPagesData.paging?.next ?? "";
        while (nextUrl) {
          const nextRes = await fetch(nextUrl);
          if (nextRes.ok) {
            const nextData = await nextRes.json();
            pages.push(...(nextData.data ?? []));
            nextUrl = nextData.paging?.next ?? "";
          } else {
            break;
          }
        }
      } catch {
        return Response.redirect(settingsUrl(`oauth_error=pages_failed`), 302);
      }
    }

    console.log(`Found ${pages.length} Facebook Pages total:`, pages.map(p => ({ id: p.id, name: p.name })));

    if (pages.length === 0) {
      const hasPagePerm = grantedPerms.includes("pages_show_list");
      const detail = hasPagePerm
        ? `no_pages:user=${encodeURIComponent(meInfo)},perms=${grantedPerms.join(",")}`
        : `no_pages:missing_pages_show_list,perms=${grantedPerms.join(",")}`;
      return Response.redirect(settingsUrl(`oauth_error=${encodeURIComponent(detail)}`), 302);
    }

    // Discover ALL Instagram accounts across ALL Pages
    // Query both instagram_business_account (Business accounts) and connected_instagram_account (Creator accounts)
    const igAccounts: IgAccount[] = [];

    for (const page of pages) {
      const igUrl = `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account,connected_instagram_account&access_token=${page.access_token}`;
      const igRes = await fetch(igUrl);
      const igRaw = await igRes.text();
      console.log(`Page ${page.id} (${page.name}) IG discovery:`, igRes.status, igRaw);
      if (igRes.ok) {
        try {
          const igBody = JSON.parse(igRaw);
          // Check both Business and Creator account fields
          const igUserId = igBody.instagram_business_account?.id ?? igBody.connected_instagram_account?.id;
          if (igUserId) {
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
        } catch { /* parse error, skip this page */ }
      }
    }

    console.log(`Found ${igAccounts.length} Instagram Business Accounts:`, igAccounts.map(a => ({ id: a.ig_user_id, username: a.username })));

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // If reconnecting a specific account, find the matching IG account
    if (reconnectAccountId) {
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

        // If no username match, try matching by existing ig_user_id
        if (!match && igAccounts.length > 1) {
          match = igAccounts.find((a) => a.ig_user_id === existingAccount.ig_user_id);
        }

        // If no match and only one IG account found, use it
        if (!match && igAccounts.length === 1) {
          match = igAccounts[0];
        }

        if (match) {
          await supabaseClient
            .from("instagram_accounts")
            .update({
              ig_user_id: match.ig_user_id,
              username: match.username || existingAccount.username,
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
          return Response.redirect(settingsUrl(`oauth=success`), 302);
        }

        // No matching IG account found
        // Store the long-lived token so the user can at least try the manual "Update access token" flow
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

        // Pass diagnostic info in the error
        const foundUsernames = igAccounts.map(a => a.username).filter(Boolean).join(', ');
        const errorMsg = foundUsernames
          ? `no_match_found:${foundUsernames}`
          : 'no_ig_account';
        return Response.redirect(settingsUrl(`oauth_error=${encodeURIComponent(errorMsg)}`), 302);
      }
    }

    // Fresh connect (not reconnecting): store all discovered IG accounts
    if (igAccounts.length === 0) {
      return Response.redirect(settingsUrl(`oauth_error=no_ig_account`), 302);
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

    return Response.redirect(settingsUrl(`oauth=success`), 302);
  } catch (error) {
    console.error("OAuth callback error:", error);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    return Response.redirect(`${supabaseUrl}/app/settings?oauth_error=${encodeURIComponent(error.message)}`, 302);
  }
});
