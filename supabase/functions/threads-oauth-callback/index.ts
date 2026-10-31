import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GRAPH = "https://graph.threads.net";
const STATE_MAX_AGE_MS = 60 * 60 * 1000;

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function verifyState(state: string, secret: string): Promise<{ u: string; ts: number; o: string } | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(fromB64url(payload));
    if (typeof data.u !== "string" || typeof data.ts !== "number") return null;
    if (Date.now() - data.ts > STATE_MAX_AGE_MS) return null;
    return { u: data.u, ts: data.ts, o: typeof data.o === "string" ? data.o : "" };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  let back = (q: string) => `${supabaseUrl}/app/threads?${q}`;

  try {
    const url = new URL(req.url);
    const appId = Deno.env.get("THREADS_APP_ID");
    const appSecret = Deno.env.get("THREADS_APP_SECRET");
    if (!appId || !appSecret) return Response.redirect(back("threads_error=not_configured"), 302);

    const state = await verifyState(url.searchParams.get("state") ?? "", appSecret);
    if (!state) return Response.redirect(back("threads_error=invalid_state"), 302);
    if (state.o) back = (q: string) => `${state.o}/app/threads?${q}`;

    const errorParam = url.searchParams.get("error");
    if (errorParam) {
      const desc = url.searchParams.get("error_description") ?? errorParam;
      return Response.redirect(back(`threads_error=${encodeURIComponent(desc)}`), 302);
    }

    const code = (url.searchParams.get("code") ?? "").replace(/#_$/, "");
    if (!code) return Response.redirect(back("threads_error=missing_code"), 302);

    const redirectUri = `${supabaseUrl}/functions/v1/threads-oauth-callback`;
    const tokenRes = await fetch(`${GRAPH}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appId, client_secret: appSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    const short = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !short.access_token) {
      console.error("Threads token exchange failed", short);
      return Response.redirect(back(`threads_error=${encodeURIComponent(short?.error?.message || "token_exchange_failed")}`), 302);
    }

    const longRes = await fetch(`${GRAPH}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(short.access_token)}`);
    const long = await longRes.json().catch(() => ({}));
    if (!longRes.ok || !long.access_token) {
      console.error("Threads long-lived exchange failed", long);
      return Response.redirect(back("threads_error=long_token_failed"), 302);
    }
    const accessToken = long.access_token as string;
    const expiresAt = new Date(Date.now() + (Number(long.expires_in) || 60 * 24 * 3600) * 1000).toISOString();

    const meRes = await fetch(`${GRAPH}/v1.0/me?fields=id,username,name,threads_profile_picture_url,threads_biography&access_token=${encodeURIComponent(accessToken)}`);
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !me.id) {
      console.error("Threads profile fetch failed", me);
      return Response.redirect(back("threads_error=profile_failed"), 302);
    }

    let followers: number | null = null;
    try {
      const insRes = await fetch(`${GRAPH}/v1.0/${me.id}/threads_insights?metric=followers_count&access_token=${encodeURIComponent(accessToken)}`);
      const ins = await insRes.json();
      const v = ins?.data?.[0]?.total_value?.value;
      if (typeof v === "number") followers = v;
    } catch { /* stats are optional */ }

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { error } = await supabase.from("threads_accounts").upsert({
      user_id: state.u,
      threads_user_id: String(me.id),
      username: me.username ?? null,
      name: me.name ?? null,
      profile_picture_url: me.threads_profile_picture_url ?? null,
      biography: me.threads_biography ?? null,
      followers_count: followers,
      access_token: accessToken,
      token_expires_at: expiresAt,
      connected: true,
      token_expired: false,
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,threads_user_id" });
    if (error) {
      console.error("Saving Threads account failed", error);
      return Response.redirect(back("threads_error=save_failed"), 302);
    }

    return Response.redirect(back(`threads_connected=${encodeURIComponent(me.username ?? "1")}`), 302);
  } catch (error) {
    console.error("threads-oauth-callback error:", error);
    return Response.redirect(back("threads_error=unexpected"), 302);
  }
});
