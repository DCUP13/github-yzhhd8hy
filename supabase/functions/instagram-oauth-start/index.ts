import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Instagram OAuth start — generates the Facebook/Instagram OAuth dialog URL
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Debug endpoint: GET request returns masked app ID and redirect URI for troubleshooting
  if (req.method === "GET") {
    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;
    if (!appId) {
      return new Response(JSON.stringify({ error: "INSTAGRAM_APP_ID not set", redirect_uri: redirectUri }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trimmed = appId.trim();
    const isNumeric = /^\d+$/.test(trimmed);
    return new Response(JSON.stringify({
      app_id_length: trimmed.length,
      app_id_prefix: trimmed.slice(0, 4),
      app_id_is_numeric: isNumeric,
      app_id_has_quotes: trimmed.startsWith('"') || trimmed.startsWith("'"),
      app_id_has_spaces: trimmed !== appId,
      redirect_uri: redirectUri,
      auth_url_preview: `https://www.facebook.com/v21.0/dialog/oauth?client_id=${trimmed}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic&response_type=code&state=test`,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const appId = Deno.env.get("INSTAGRAM_APP_ID");
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");

    if (!appId || !appSecret) {
      return new Response(JSON.stringify({
        error: "OAuth is not configured. Add INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET to your Supabase secrets.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept app_origin from request body so the callback knows where to redirect
    const body = await req.json().catch(() => ({}));
    const appOrigin = (body as { app_origin?: string })?.app_origin || "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;

    const scope = "instagram_basic,instagram_content_publish,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_engagement,pages_messaging,business_basic_msg,business_manage_messages";

    // Generate a secure state parameter containing the user ID and app origin
    const state = btoa(JSON.stringify({ user_id: user.id, ts: Date.now(), origin: appOrigin }));

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${encodeURIComponent(state)}`;

    return new Response(JSON.stringify({ auth_url: authUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OAuth start error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
