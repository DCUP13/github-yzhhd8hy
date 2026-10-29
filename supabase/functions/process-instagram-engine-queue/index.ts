import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EnginePost {
  id: string;
  user_id: string;
  slot_id: string | null;
  link_id: string | null;
  caption: string;
  hashtags: string[];
  media_asset_ids: string[];
  media_urls: string[];
  overlay_mode: string;
  overlay_text: string;
  overlay_texts: string[];
  overlay_scope: string;
  overlay_font_size: number | null;
  account_ids: string[];
  carousel_size: number;
}

interface Variation {
  id: string;
  engine_post_id: string;
  account_id: string;
  status: string;
  permalink: string | null;
  error_message: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function keyFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return url;
  }
}

async function fail(supabase: SupabaseClient, postId: string, message: string) {
  await supabase.from("instagram_scheduled_posts")
    .update({ status: "failed", publish_error: message, updated_at: new Date().toISOString() })
    .eq("id", postId);
}

async function overlayImage(post: EnginePost, sourceUrl: string, text: string): Promise<{ url: string; key: string }> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/overlay-text-on-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    },
    body: JSON.stringify({
      user_id: post.user_id, source_url: sourceUrl, text, target_folder: "scheduled-overlay",
      overlay_settings: { fontSize: post.overlay_font_size || 64 },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || typeof out.cloudfront_url !== "string") throw new Error(`Could not add the text overlay: ${out.error || res.status}`);
  return { url: out.cloudfront_url, key: out.s3_key || keyFromUrl(out.cloudfront_url) };
}

function photoTexts(post: EnginePost, count: number): string[] {
  if (post.overlay_mode === "none") return Array(count).fill("");
  if (post.overlay_scope !== "all" || count < 2) return [post.overlay_text.trim(), ...Array(count - 1).fill("")];
  const saved = post.overlay_texts || [];
  const fallback = post.overlay_mode === "fixed" && !saved.length ? post.overlay_text.trim() : "";
  return Array.from({ length: count }, (_, i) => (saved[i] ?? fallback).trim());
}

async function fanOut(supabase: SupabaseClient, postId: string) {
  const { data, error } = await supabase.from("instagram_scheduled_posts").select("*").eq("id", postId).maybeSingle();
  if (error || !data) return;
  const post = data as EnginePost;

  if (!post.media_urls?.length) return fail(supabase, post.id, "This post has no photos");
  if (!post.account_ids?.length) return fail(supabase, post.id, "No Instagram accounts are selected for this post");

  const { data: owned } = await supabase.from("instagram_accounts").select("id").eq("user_id", post.user_id).in("id", post.account_ids);
  const accountIds = ((owned || []) as { id: string }[]).map((a) => a.id);
  if (accountIds.length === 0) return fail(supabase, post.id, "The selected Instagram accounts are no longer connected");
  const missing = post.account_ids.length - accountIds.length;

  let link = "";
  if (post.link_id) {
    const { data: saved } = await supabase.from("instagram_links").select("url").eq("id", post.link_id).eq("user_id", post.user_id).maybeSingle();
    link = ((saved as { url: string } | null)?.url || "").trim();
  }
  const caption = [post.caption.trim(), link].filter(Boolean).join("\n\n");

  const keyByUrl = new Map<string, string>();
  if (post.media_asset_ids?.length) {
    const { data: assets } = await supabase.from("media_assets").select("cloudfront_url, s3_key").in("id", post.media_asset_ids);
    for (const a of (assets || []) as { cloudfront_url: string; s3_key: string }[]) keyByUrl.set(a.cloudfront_url, a.s3_key);
  }
  const urls = [...post.media_urls];
  let firstKey = keyByUrl.get(urls[0]) || keyFromUrl(urls[0]);

  const texts = photoTexts(post, urls.length);
  if (texts.some(Boolean)) {
    try {
      const rendered = await Promise.all(urls.map((u, i) => (texts[i] ? overlayImage(post, u, texts[i]) : Promise.resolve(null))));
      rendered.forEach((r, i) => { if (r) urls[i] = r.url; });
      if (rendered[0]) firstKey = rendered[0].key;
    } catch (e) {
      return fail(supabase, post.id, e instanceof Error ? e.message : "Could not add the text overlay");
    }
  }

  const { data: existingRows } = await supabase
    .from("instagram_post_variations")
    .select("id, account_id, status")
    .eq("engine_post_id", post.id);
  const existing = new Map(((existingRows || []) as { id: string; account_id: string; status: string }[]).map((v) => [v.account_id, v]));

  const now = new Date().toISOString();
  const fields = {
    cloudfront_url: urls[0],
    s3_key: firstKey,
    carousel_urls: urls.length > 1 ? urls : [],
    caption,
    hashtags: post.hashtags || [],
    status: "scheduled",
    scheduled_for: now,
    error_message: null,
    retry_count: 0,
    updated_at: now,
  };

  const toInsert = accountIds.filter((id) => !existing.has(id));
  const toRetry = accountIds.filter((id) => existing.get(id)?.status === "failed");

  for (const accountId of toRetry) {
    await supabase.from("instagram_post_variations").update(fields).eq("id", existing.get(accountId)!.id);
  }

  if (toInsert.length) {
    const { data: batch, error: batchErr } = await supabase
      .from("instagram_post_batches")
      .insert({
        user_id: post.user_id,
        base_caption: caption,
        hashtags: post.hashtags || [],
        selected_asset_ids: post.media_asset_ids || [],
        carousel_size: Math.max(1, urls.length),
        status: "scheduled",
      })
      .select("id")
      .maybeSingle();
    if (batchErr || !batch) return fail(supabase, post.id, "Could not queue this post for publishing");

    const { error: insErr } = await supabase.from("instagram_post_variations").insert(
      toInsert.map((accountId) => ({ ...fields, batch_id: batch.id, user_id: post.user_id, account_id: accountId, engine_post_id: post.id })),
    );
    if (insErr) return fail(supabase, post.id, "Could not queue this post for publishing");
  }

  if (missing > 0) {
    await supabase.from("instagram_scheduled_posts")
      .update({ publish_error: `${missing} selected account(s) are no longer connected and were skipped` })
      .eq("id", post.id);
  }
}

async function syncPublishing(supabase: SupabaseClient) {
  const { data: posts } = await supabase
    .from("instagram_scheduled_posts")
    .select("id, publish_error")
    .eq("status", "publishing")
    .limit(100);
  if (!posts?.length) return;

  const ids = (posts as { id: string }[]).map((p) => p.id);
  const { data: vars } = await supabase
    .from("instagram_post_variations")
    .select("id, engine_post_id, account_id, status, permalink, error_message")
    .in("engine_post_id", ids);
  const byPost = new Map<string, Variation[]>();
  for (const v of (vars || []) as Variation[]) {
    byPost.set(v.engine_post_id, [...(byPost.get(v.engine_post_id) || []), v]);
  }

  for (const p of posts as { id: string; publish_error: string | null }[]) {
    const list = byPost.get(p.id) || [];
    if (list.length === 0) continue;
    const results = list.map((v) => ({ account_id: v.account_id, status: v.status, permalink: v.permalink, error: v.error_message }));
    const done = list.every((v) => v.status === "published" || v.status === "failed");
    const update: Record<string, unknown> = { publish_results: results, updated_at: new Date().toISOString() };
    if (done) {
      const ok = list.filter((v) => v.status === "published").length;
      update.status = ok === list.length ? "published" : ok === 0 ? "failed" : "partial";
      if (ok > 0) update.published_at = new Date().toISOString();
      if (ok < list.length) {
        update.publish_error = list.find((v) => v.status === "failed")?.error_message || "Publishing failed";
      } else if (!p.publish_error?.includes("skipped")) {
        update.publish_error = null;
      }
    }
    await supabase.from("instagram_scheduled_posts").update(update).eq("id", p.id);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: claimed, error } = await supabase.rpc("instagram_claim_publish", { p_limit: 10 });
    if (error) return json({ error: error.message }, 500);
    const ids = ((claimed || []) as unknown[]).map((r) => (typeof r === "string" ? r : (r as Record<string, string>).instagram_claim_publish ?? (r as Record<string, string>).id));

    let queued = 0;
    for (const id of ids) {
      try {
        await fanOut(supabase, id);
        queued++;
      } catch (e) {
        console.error(`Failed to queue engine post ${id}:`, e);
        await fail(supabase, id, e instanceof Error ? e.message : "Could not queue this post");
      }
    }

    await syncPublishing(supabase);
    return json({ success: true, queued });
  } catch (e) {
    console.error("process-instagram-engine-queue error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
