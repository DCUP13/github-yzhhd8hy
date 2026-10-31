import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GRAPH = "https://graph.threads.net/v1.0";
const METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"] as const;

interface Result { account_id: string; username: string | null; ok: boolean; media_id?: string; permalink?: string; error?: string; deleted?: boolean }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function tokensFor(supabase: SupabaseClient, userId: string): Promise<Map<string, { token: string; threads_user_id: string }>> {
  const { data } = await supabase.from("threads_accounts").select("id, threads_user_id, access_token").eq("user_id", userId).eq("connected", true);
  const map = new Map<string, { token: string; threads_user_id: string }>();
  for (const a of data || []) if (a.access_token) map.set(a.id as string, { token: a.access_token as string, threads_user_id: a.threads_user_id as string });
  return map;
}

async function syncUser(supabase: SupabaseClient, userId: string) {
  const tokens = await tokensFor(supabase, userId);
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: posts } = await supabase
    .from("threads_posts")
    .select("id, publish_results")
    .eq("user_id", userId)
    .in("status", ["published", "partial"])
    .gte("published_at", since)
    .limit(200);
  let updated = 0;
  for (const p of posts || []) {
    const totals: Record<string, number> = Object.fromEntries(METRICS.map((m) => [m, 0]));
    let any = false;
    for (const r of (p.publish_results as Result[]) || []) {
      const acc = tokens.get(r.account_id);
      if (!r.ok || !r.media_id || r.deleted || !acc) continue;
      const res = await fetch(`${GRAPH}/${r.media_id}/insights?metric=${METRICS.join(",")}&access_token=${encodeURIComponent(acc.token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) continue;
      any = true;
      for (const d of body?.data || []) {
        const v = d?.values?.[0]?.value ?? d?.total_value?.value;
        if (typeof v === "number" && d.name in totals) totals[d.name] += v;
      }
    }
    if (any) {
      await supabase.from("threads_posts").update({ ...totals, insights_synced_at: new Date().toISOString() }).eq("id", p.id);
      updated++;
    }
  }
  for (const [id, acc] of tokens) {
    const res = await fetch(`${GRAPH}/${acc.threads_user_id}/threads_insights?metric=followers_count&access_token=${encodeURIComponent(acc.token)}`);
    const body = await res.json().catch(() => ({}));
    const v = body?.data?.[0]?.total_value?.value;
    if (res.ok && typeof v === "number") await supabase.from("threads_accounts").update({ followers_count: v }).eq("id", id);
  }
  return updated;
}

async function deletePost(supabase: SupabaseClient, userId: string, postId: string) {
  const { data: post } = await supabase.from("threads_posts").select("id, user_id, status, publish_results").eq("id", postId).maybeSingle();
  if (!post || post.user_id !== userId) return json({ error: "Post not found" }, 404);
  if (!["published", "partial"].includes(post.status as string)) return json({ error: "Only published posts can be removed from Threads" }, 400);
  const tokens = await tokensFor(supabase, userId);
  const results = ((post.publish_results as Result[]) || []).map((r) => ({ ...r }));
  const problems: string[] = [];
  for (const r of results) {
    if (!r.ok || !r.media_id || r.deleted) continue;
    const acc = tokens.get(r.account_id);
    if (!acc) { problems.push(`@${r.username ?? "profile"} is no longer connected`); continue; }
    const res = await fetch(`${GRAPH}/${r.media_id}?access_token=${encodeURIComponent(acc.token)}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.success !== false) r.deleted = true;
    else problems.push(`@${r.username ?? "profile"}: ${body?.error?.message || "could not delete"}`);
  }
  const allGone = results.every((r) => !r.ok || r.deleted);
  const { data: saved } = await supabase
    .from("threads_posts")
    .update({ publish_results: results, status: allGone ? "deleted" : post.status, publish_error: problems.length ? problems.join(" ") : null, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .select("*")
    .maybeSingle();
  if (problems.length) return json({ error: problems.join(" "), post: saved }, 207);
  return json({ post: saved });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({})) as { action?: string; post_id?: string };

    if (body.action === "sync_insights") return json({ updated: await syncUser(supabase, user.id) });
    if (body.action === "delete_post" && typeof body.post_id === "string") return await deletePost(supabase, user.id, body.post_id);
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("threads-actions error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
