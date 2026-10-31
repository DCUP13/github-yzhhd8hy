import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SCOPE = "threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies,threads_delete";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

function safeOrigin(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? `${u.protocol}//${u.host}` : "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const appId = Deno.env.get("THREADS_APP_ID");
    const appSecret = Deno.env.get("THREADS_APP_SECRET");
    if (!appId || !appSecret) return json({ error: "Threads connection is not set up yet. The Threads App ID and App Secret still need to be added." }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({})) as { app_origin?: string };
    const payload = b64url(new TextEncoder().encode(JSON.stringify({
      u: user.id,
      ts: Date.now(),
      o: safeOrigin(body.app_origin),
      n: crypto.randomUUID(),
    })));
    const state = `${payload}.${await sign(payload, appSecret)}`;

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/threads-oauth-callback`;
    const authUrl = `https://threads.com/oauth/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPE)}&response_type=code&state=${encodeURIComponent(state)}`;

    return json({ auth_url: authUrl });
  } catch (error) {
    console.error("threads-oauth-start error:", error);
    return json({ error: error instanceof Error ? error.message : "Could not start Threads connection" }, 500);
  }
});
