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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const redirectUri = `${supabaseUrl}/functions/v1/linkedin-oauth-callback`;

    let stateData: { user_id: string; ts: number; origin?: string };
    try {
      stateData = JSON.parse(atob(stateParam ?? ""));
    } catch {
      return Response.redirect(`${supabaseUrl}/app/linkedin?oauth_error=invalid_state`, 302);
    }

    const userId = stateData.user_id;
    if (!userId) {
      return Response.redirect(`${supabaseUrl}/app/linkedin?oauth_error=no_user`, 302);
    }

    let appOrigin = stateData.origin || "";
    if (!appOrigin) {
      appOrigin = supabaseUrl;
    }

    const linkedinUrl = (suffix: string) => `${appOrigin}/app/linkedin?${suffix}`;

    if (errorParam) {
      return Response.redirect(linkedinUrl(`oauth_error=${encodeURIComponent(errorParam)}`), 302);
    }

    if (!code || !stateParam) {
      return Response.redirect(linkedinUrl(`oauth_error=missing_params`), 302);
    }

    const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
    const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return Response.redirect(linkedinUrl(`oauth_error=not_configured`), 302);
    }

    // Exchange authorization code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("LinkedIn token exchange failed:", errText);
      return Response.redirect(linkedinUrl(`oauth_error=token_exchange_failed`), 302);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("No access_token in LinkedIn response:", JSON.stringify(tokenData));
      return Response.redirect(linkedinUrl(`oauth_error=no_token`), 302);
    }

    // Fetch the member's profile using OpenID Connect /userinfo endpoint
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error("LinkedIn profile fetch failed:", errText);
      return Response.redirect(linkedinUrl(`oauth_error=profile_fetch_failed`), 302);
    }

    const profile = await profileRes.json();
    const memberName = profile.name || profile.given_name || "LinkedIn Member";
    const memberEmail = profile.email || null;
    const profilePicture = profile.picture || null;
    const sub = profile.sub;

    if (!sub) {
      console.error("No sub in LinkedIn profile:", JSON.stringify(profile));
      return Response.redirect(linkedinUrl(`oauth_error=no_person_id`), 302);
    }

    // Construct the Person URN
    const personUrn = `urn:li:person:${sub}`;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Upsert the account
    const { data: existing } = await supabaseClient
      .from("linkedin_accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const payload = {
      user_id: userId,
      access_token: accessToken,
      person_urn: personUrn,
      member_name: memberName,
      member_email: memberEmail,
      profile_picture_url: profilePicture,
      connected: true,
      token_expired: false,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabaseClient
        .from("linkedin_accounts")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await supabaseClient
        .from("linkedin_accounts")
        .insert(payload);
    }

    return Response.redirect(linkedinUrl(`oauth=success`), 302);
  } catch (error) {
    console.error("LinkedIn OAuth callback error:", error);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    return Response.redirect(`${supabaseUrl}/app/linkedin?oauth_error=${encodeURIComponent(error.message)}`, 302);
  }
});
