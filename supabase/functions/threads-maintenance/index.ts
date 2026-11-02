import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GRAPH = "https://graph.threads.net";
const METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"];

interface Result { account_id: string; ok: boolean; media_id?: string; deleted?: boolean }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const now = Date.now();

    // Long-lived tokens last ~60 days; refresh anything expiring within 15 days and at least a day old.
    const { data: due } = await supabase
      .from("threads_accounts")
      .select("id, access_token, token_expires_at, last_refreshed_at")
      .eq("connected", true)
      .not("access_token", "is", null)
      .lt("token_expires_at", new Date(now + 15 * 86400000).toISOString())
      .limit(50);
    let refreshed = 0;
    for (const a of due || []) {
      if (a.last_refreshed_at && now - new Date(a.last_refreshed_at as string).getTime() < 86400000) continue;
      if (a.token_expires_at && new Date(a.token_expires_at as string).getTime() < now) {
        await supabase.from("threads_accounts").update({ token_expired: true }).eq("id", a.id);
        continue;
      }
      const res = await fetch(`${GRAPH}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(a.access_token as string)}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.access_token) {
        await supabase.from("threads_accounts").update({
          access_token: body.access_token,
          token_expires_at: new Date(now + (Number(body.expires_in) || 60 * 86400) * 1000).toISOString(),
          token_expired: false,
          last_refreshed_at: new Date().toISOString(),
        }).eq("id", a.id);
        refreshed++;
      } else {
        await supabase.from("threads_accounts").update({ token_expired: true, last_refreshed_at: new Date().toISOString() }).eq("id", a.id);
      }
    }

    // Stats for posts from the last 30 days that haven't been checked in the last 3 hours.
    const { data: posts } = await supabase
      .from("threads_posts")
      .select("id, user_id, publish_results, insights_synced_at")
      .in("status", ["published", "partial"])
      .gte("published_at", new Date(now - 30 * 86400000).toISOString())
      .or(`insights_synced_at.is.null,insights_synced_at.lt.${new Date(now - 3 * 3600000).toISOString()}`)
      .order("insights_synced_at", { ascending: true, nullsFirst: true })
      .limit(40);
    const accIds = [...new Set((posts || []).flatMap((p) => ((p.publish_results as Result[]) || []).map((r) => r.account_id)))];
    const { data: accs } = accIds.length
      ? await supabase.from("threads_accounts").select("id, user_id, access_token").in("id", accIds).eq("connected", true)
      : { data: [] };
    const tokens = new Map((accs || []).filter((a) => a.access_token).map((a) => [a.id as string, { token: a.access_token as string, user_id: a.user_id as string }]));

    let synced = 0;
    for (const p of posts || []) {
      const totals: Record<string, number> = Object.fromEntries(METRICS.map((m) => [m, 0]));
      let any = false;
      for (const r of (p.publish_results as Result[]) || []) {
        const acc = tokens.get(r.account_id);
        if (!r.ok || !r.media_id || r.deleted || !acc || acc.user_id !== p.user_id) continue;
        const res = await fetch(`${GRAPH}/v1.0/${r.media_id}/insights?metric=${METRICS.join(",")}&access_token=${encodeURIComponent(acc.token)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) continue;
        any = true;
        for (const d of body?.data || []) {
          const v = d?.values?.[0]?.value ?? d?.total_value?.value;
          if (typeof v === "number" && d.name in totals) totals[d.name] += v;
        }
      }
      await supabase.from("threads_posts").update(any ? { ...totals, insights_synced_at: new Date().toISOString() } : { insights_synced_at: new Date().toISOString() }).eq("id", p.id);
      if (any) synced++;
    }

    return json({ refreshed, synced });
  } catch (e) {
    console.error("threads-maintenance error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
