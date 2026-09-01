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
    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");

    if (!appId || !appSecret) {
      return new Response(JSON.stringify({ error: "OAuth is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const authToken = authHeader.replace("Bearer ", "");

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authToken);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const code = (body as { code?: string })?.code;
    const stateParam = (body as { state?: string })?.state;
    const redirectUri = (body as { redirect_uri?: string })?.redirect_uri;

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!redirectUri) {
      return new Response(JSON.stringify({ error: "Missing redirect_uri" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse state to get reconnect target
    let reconnectAccountId = "";
    if (stateParam) {
      try {
        const stateData = JSON.parse(atob(stateParam));
        reconnectAccountId = stateData.reconnect_account_id || "";
      } catch { /* ignore malformed state */ }
    }

    // Exchange code for short-lived Instagram access token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to exchange authorization code for access token." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;
    const igUserId = tokenData.user_id;

    if (!shortLivedToken) {
      return new Response(JSON.stringify({ error: "No access token returned from Instagram." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Short-lived token obtained for IG user:", igUserId);

    // Exchange for long-lived Instagram access token (60 days)
    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;
    const longLivedRes = await fetch(longLivedUrl);

    if (!longLivedRes.ok) {
      const errText = await longLivedRes.text();
      console.error("Long-lived token exchange failed:", errText);
      return new Response(JSON.stringify({ error: "Failed to get a long-lived access token." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const longLivedData = await longLivedRes.json();
    const longLivedToken = longLivedData.access_token;

    if (!longLivedToken) {
      return new Response(JSON.stringify({ error: "No long-lived token returned." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Long-lived token obtained, expires in:", longLivedData.expires_in, "seconds");

    // Fetch the user's profile info using the Instagram token directly
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
      username: (profile.username as string) ?? "",
      profile_picture_url: (profile.profile_picture_url as string) ?? null,
      followers_count: (profile.followers_count as number) ?? null,
      follows_count: (profile.follows_count as number) ?? null,
      media_count: (profile.media_count as number) ?? null,
      access_token: longLivedToken,
    };

    const userId = user.id;

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

        return new Response(JSON.stringify({ success: true, username: igAccount.username }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    return new Response(JSON.stringify({ success: true, username: igAccount.username }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OAuth exchange error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
