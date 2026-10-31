import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GRAPH = "https://graph.threads.net/v1.0";
const BATCH = 4;
const MAX_CHARS = 500;

interface Post {
  id: string;
  user_id: string;
  content_text: string;
  link_id: string | null;
  media_urls: string[];
  media_asset_ids: string[];
  account_ids: string[];
  also_instagram: boolean;
  instagram_account_ids: string[];
  instagram_post_id: string | null;
}

interface Account {
  id: string;
  threads_user_id: string;
  username: string | null;
  access_token: string | null;
}

interface Result {
  account_id: string;
  username: string | null;
  ok: boolean;
  media_id?: string;
  permalink?: string;
  error?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph(path: string, token: string, params: Record<string, string> = {}, method = "POST") {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(method === "GET" ? `${GRAPH}/${path}?${qs}` : `${GRAPH}/${path}`, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : qs,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    const err = new Error(body?.error?.error_user_msg || body?.error?.message || `Threads request failed (${res.status})`);
    (err as Error & { code?: number }).code = body?.error?.code;
    throw err;
  }
  return body;
}

async function waitReady(containerId: string, token: string) {
  for (let i = 0; i < 12; i++) {
    const s = await graph(containerId, token, { fields: "status,error_message" }, "GET");
    if (s.status === "FINISHED" || s.status === "PUBLISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") throw new Error(s.error_message || "Threads could not process the photos");
    await sleep(2500);
  }
  throw new Error("Threads took too long to process the photos");
}

async function publishTo(account: Account, text: string, urls: string[]): Promise<Result> {
  const base = { account_id: account.id, username: account.username };
  const token = account.access_token!;
  const uid = account.threads_user_id;
  try {
    let creationId: string;
    if (urls.length === 0) {
      creationId = (await graph(`${uid}/threads`, token, { media_type: "TEXT", text })).id;
    } else if (urls.length === 1) {
      creationId = (await graph(`${uid}/threads`, token, { media_type: "IMAGE", image_url: urls[0], text })).id;
      await waitReady(creationId, token);
    } else {
      const children: string[] = [];
      for (const u of urls.slice(0, 20)) {
        children.push((await graph(`${uid}/threads`, token, { media_type: "IMAGE", image_url: u, is_carousel_item: "true" })).id);
      }
      for (const c of children) await waitReady(c, token);
      creationId = (await graph(`${uid}/threads`, token, { media_type: "CAROUSEL", children: children.join(","), text })).id;
      await waitReady(creationId, token);
    }
    const published = await graph(`${uid}/threads_publish`, token, { creation_id: creationId });
    let permalink: string | undefined;
    try {
      permalink = (await graph(published.id, token, { fields: "permalink" }, "GET")).permalink;
    } catch { /* permalink is optional */ }
    return { ...base, ok: true, media_id: String(published.id), permalink };
  } catch (e) {
    return { ...base, ok: false, error: e instanceof Error ? e.message : "Could not publish" };
  }
}

async function crossPostInstagram(supabase: SupabaseClient, post: Post, text: string, urls: string[]): Promise<string | null> {
  if (!post.also_instagram || post.instagram_post_id) return null;
  if (!urls.length) return "Instagram was skipped because it needs at least one photo.";
  const { data: igAccounts } = await supabase
    .from("instagram_accounts")
    .select("id")
    .eq("user_id", post.user_id)
    .in("id", post.instagram_account_ids.length ? post.instagram_account_ids : ["00000000-0000-0000-0000-000000000000"]);
  const ids = (igAccounts || []).map((a) => a.id as string);
  if (!ids.length) return "Instagram was skipped because no Instagram account was chosen.";
  const igUrls = urls.slice(0, 10);
  const { data: ig, error } = await supabase.from("instagram_scheduled_posts").insert({
    user_id: post.user_id,
    scheduled_for: new Date().toISOString(),
    caption: text,
    hashtags: [],
    media_type: igUrls.length > 1 ? "carousel" : "single",
    carousel_size: igUrls.length,
    media_urls: igUrls,
    account_ids: ids,
    overlay_mode: "none",
    status: "scheduled",
    generation_status: "done",
  }).select("id").maybeSingle();
  if (error || !ig) return "Could not send this post to Instagram.";
  await supabase.from("threads_posts").update({ instagram_post_id: ig.id }).eq("id", post.id);
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-instagram-engine-queue`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }).catch(() => undefined);
  return null;
}

async function processPost(supabase: SupabaseClient, id: string) {
  const { data: row } = await supabase.from("threads_posts").select("*").eq("id", id).maybeSingle();
  if (!row) return;
  const post = row as Post;
  const finish = (patch: Record<string, unknown>) =>
    supabase.from("threads_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);

  let link = "";
  if (post.link_id) {
    const { data } = await supabase.from("threads_links").select("url").eq("id", post.link_id).eq("user_id", post.user_id).maybeSingle();
    link = (data?.url as string) || "";
  }
  const text = [post.content_text.trim(), link].filter(Boolean).join("\n\n");
  if (!text && !post.media_urls.length) return finish({ status: "failed", publish_error: "This post is empty" });
  if (text.length > MAX_CHARS) return finish({ status: "failed", publish_error: `Threads posts can be at most ${MAX_CHARS} characters (this one has ${text.length})` });

  let urls = [...(post.media_urls || [])];
  if (!urls.length && post.media_asset_ids?.length) {
    const { data: assets } = await supabase.from("media_assets").select("cloudfront_url").eq("user_id", post.user_id).in("id", post.media_asset_ids);
    urls = (assets || []).map((a) => a.cloudfront_url as string).filter(Boolean);
  }

  const { data: accRows } = await supabase
    .from("threads_accounts")
    .select("id, threads_user_id, username, access_token")
    .eq("user_id", post.user_id)
    .eq("connected", true)
    .in("id", post.account_ids.length ? post.account_ids : ["00000000-0000-0000-0000-000000000000"]);
  const accounts = ((accRows || []) as Account[]).filter((a) => a.access_token);

  const results: Result[] = [];
  for (const a of accounts) results.push(await publishTo(a, text, urls));
  for (const r of results) {
    if (!r.ok && /session|token|OAuth|expired/i.test(r.error || "")) {
      await supabase.from("threads_accounts").update({ token_expired: true }).eq("id", r.account_id);
    }
  }

  const igNote = await crossPostInstagram(supabase, post, text, urls);
  const okCount = results.filter((r) => r.ok).length;
  const status = !accounts.length ? "failed" : okCount === results.length ? "published" : okCount ? "partial" : "failed";
  const errors = [
    !accounts.length ? "No connected Threads profile was chosen for this post." : "",
    ...results.filter((r) => !r.ok).map((r) => `@${r.username ?? "profile"}: ${r.error}`),
    igNote ?? "",
  ].filter(Boolean);

  await finish({
    status,
    publish_results: results,
    publish_error: errors.length ? errors.join(" ") : null,
    published_at: okCount ? new Date().toISOString() : null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: claimed, error } = await supabase.rpc("threads_claim_publish", { p_limit: BATCH });
    if (error) return json({ error: error.message }, 500);
    const ids = ((claimed || []) as unknown[]).map((r) => (typeof r === "string" ? r : (r as Record<string, string>).threads_claim_publish ?? (r as Record<string, string>).id));
    const results = await Promise.allSettled(ids.map((id) => processPost(supabase, id)));
    for (const [i, r] of results.entries()) {
      if (r.status === "rejected") {
        console.error("threads publish failed", ids[i], r.reason);
        await supabase.from("threads_posts").update({ status: "failed", publish_error: "Something went wrong while publishing" }).eq("id", ids[i]);
      }
    }
    return json({ processed: ids.length });
  } catch (e) {
    console.error("process-threads-queue error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
