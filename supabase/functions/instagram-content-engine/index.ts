import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TICK_BATCH = 6;

type Row = Record<string, unknown>;
type Parts = "all" | "caption" | "media" | "overlay";

interface Post {
  id: string;
  user_id: string;
  slot_id: string | null;
  link_id: string | null;
  prompt_id: string | null;
  topic_id: string | null;
  topic_name: string | null;
  voice_sample_id: string | null;
  scheduled_for: string;
  caption: string;
  hashtags: string[];
  media_type: "single" | "carousel";
  carousel_size: number;
  media_asset_ids: string[];
  media_urls: string[];
  overlay_mode: "none" | "ai" | "fixed";
  overlay_text: string;
  overlay_texts: string[];
  overlay_scope: "first" | "all";
  overlay_prompt_id: string | null;
  status: string;
  generation_status: string;
}

interface Asset {
  id: string;
  cloudfront_url: string;
  file_name: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Content = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" } }>;

async function chatJson<T>(system: string, user: Content, schema?: { name: string; schema: Record<string, unknown> }): Promise<T> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("AI writing is not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: schema
        ? { type: "json_schema", json_schema: { name: schema.name, strict: true, schema: schema.schema } }
        : { type: "json_object" },
      temperature: 0.85,
      max_tokens: 1500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI returned an empty response");
  return JSON.parse(content) as T;
}

async function pickMedia(supabase: SupabaseClient, post: Post, avoidCurrent: boolean): Promise<Asset[]> {
  const want = post.media_type === "carousel" ? Math.max(2, post.carousel_size) : 1;
  const [{ data: assets, error }, { data: used }] = await Promise.all([
    supabase.from("media_assets").select("id, cloudfront_url, file_name").eq("user_id", post.user_id).eq("file_type", "image"),
    supabase
      .from("instagram_scheduled_posts")
      .select("media_asset_ids, scheduled_for")
      .eq("user_id", post.user_id)
      .neq("id", post.id)
      .neq("media_asset_ids", "{}")
      .order("scheduled_for", { ascending: false })
      .limit(500),
  ]);
  if (error) throw new Error("Could not load your Content Library");
  if (!assets || assets.length === 0) throw new Error("Add photos to your Content Library so posts can be illustrated");

  const target = new Date(post.scheduled_for).getTime();
  const nearest = new Map<string, number>();
  for (const u of (used || []) as { media_asset_ids: string[]; scheduled_for: string }[]) {
    const gap = Math.abs(new Date(u.scheduled_for).getTime() - target);
    for (const id of u.media_asset_ids || []) {
      const prev = nearest.get(id);
      if (prev === undefined || gap < prev) nearest.set(id, gap);
    }
  }
  if (avoidCurrent) for (const id of post.media_asset_ids) nearest.set(id, -1);

  const scored = (assets as Asset[]).map((a) => {
    const gap = nearest.get(a.id);
    const base = gap === undefined ? Number.MAX_SAFE_INTEGER : gap;
    return { a, score: base === Number.MAX_SAFE_INTEGER ? base - Math.random() * 1e6 : base * (0.75 + Math.random() * 0.5) };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, want).map((s) => s.a);
}

function fill(template: string, topic: string, voice: string) {
  return template.replace(/\{\{\s*topic\s*\}\}/gi, topic || "(no topic)").replace(/\{\{\s*voice\s*\}\}/gi, voice || "(default voice)");
}

async function loadVoice(supabase: SupabaseClient, post: Post): Promise<string> {
  if (!post.voice_sample_id) return "";
  const { data } = await supabase.from("instagram_voice_samples").select("content").eq("id", post.voice_sample_id).eq("user_id", post.user_id).maybeSingle();
  return ((data as { content: string } | null)?.content || "").trim();
}

async function writeCaption(
  supabase: SupabaseClient,
  post: Post,
  imageUrls: string[],
  instructions: string,
): Promise<{ caption: string; hashtags: string[] }> {
  const [slotRes, promptRes, voiceText] = await Promise.all([
    post.slot_id
      ? supabase.from("instagram_plan_slots").select("extra_instructions").eq("id", post.slot_id).maybeSingle()
      : Promise.resolve({ data: null }),
    post.prompt_id
      ? supabase.from("prompts").select("content").eq("id", post.prompt_id).eq("user_id", post.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadVoice(supabase, post),
  ]);
  const slot = slotRes.data as { extra_instructions: string } | null;
  const promptText = ((promptRes.data as { content: string } | null)?.content || "").trim();
  const topic = post.topic_name || "";

  const system = [
    "You are an expert Instagram copywriter. Write one Instagram caption.",
    "Rules: open with a scroll-stopping first line; use short paragraphs and line breaks; sound human, never generic; at most 2200 characters.",
    "Do NOT include any URLs or web addresses in the caption.",
    post.link_id ? "A web link will be added automatically right after the caption. You may end with a short call to action pointing to the link below, but never write the link itself." : "",
    "Return 5-12 relevant hashtags separately (each starting with #), never inside the caption.",
    'Return JSON: {"caption": string, "hashtags": string[]}',
  ].filter(Boolean).join("\n");

  const userText = [
    `Topic: ${topic || "(choose something fitting the photos)"}`,
    `Planned posting date: ${new Date(post.scheduled_for).toDateString()}`,
    post.media_type === "carousel" ? `This is a carousel of ${imageUrls.length} photos.` : "This is a single photo post.",
    promptText ? `Writing instructions:\n${fill(promptText, topic, voiceText)}` : "",
    slot?.extra_instructions?.trim() ? `Extra instructions:\n${fill(slot.extra_instructions, topic, voiceText)}` : "",
    voiceText ? `Match the tone, rhythm and vocabulary of this writing sample (do not copy it):\n"""${voiceText.slice(0, 4000)}"""` : "",
    instructions.trim() ? `Revision request from the author:\n${instructions.trim()}\n\nCurrent caption:\n${post.caption}` : "",
    imageUrls.length ? "The attached photos will be posted with this caption; reference what is shown when it helps." : "",
  ].filter(Boolean).join("\n\n");

  let result: { caption?: unknown; hashtags?: unknown };
  try {
    result = await chatJson(system, [
      { type: "text", text: userText },
      ...imageUrls.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } })),
    ]);
  } catch (e) {
    if (!imageUrls.length) throw e;
    result = await chatJson(system, userText);
  }

  const caption = typeof result.caption === "string" ? result.caption.trim() : "";
  if (!caption) throw new Error("AI returned an empty caption");
  const hashtags = Array.isArray(result.hashtags)
    ? result.hashtags.filter((h): h is string => typeof h === "string" && h.trim().length > 1).map((h) => (h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`)).slice(0, 15)
    : [];
  return { caption, hashtags };
}

const DEFAULT_OVERLAY_SINGLE = "Write a punchy 3-9 word headline that stops the scroll and fits the photo.";
const DEFAULT_OVERLAY_CAROUSEL = [
  "Write the text for each photo of a carousel so the slides read as one short story, in order.",
  "Photo 1 (cover): a scroll-stopping hook of 3-8 words that makes people swipe.",
  "Middle photos: one clear point each, at most 12 words, building on the previous slide and fitting what the photo shows.",
  "Last photo: a short call to action, e.g. save this, share it, or read the caption.",
].join("\n");

const PHOTO_TEXT_SCHEMA = {
  name: "photo_texts",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["photos"],
    properties: {
      photos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["photo", "text"],
          properties: { photo: { type: "integer" }, text: { type: "string" } },
        },
      },
    },
  },
};

function cleanPhotoText(raw: string): string {
  return raw
    .replace(/^\s*(?:photo|slide|image|pic)?\s*#?\d+\s*[:.)\-]\s*/i, "")
    .replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function parsePhotoTexts(result: unknown, count: number): string[] {
  const out: string[] = Array(count).fill("");
  const r = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  const list = [r.photos, r.texts, r.slides].find(Array.isArray) as unknown[] | undefined;
  if (!list) return out;
  const unnumbered: string[] = [];
  for (const item of list) {
    if (typeof item === "string") { unnumbered.push(cleanPhotoText(item)); continue; }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === "string" ? cleanPhotoText(o.text) : "";
    const n = Number(o.photo ?? o.slide ?? o.index);
    if (Number.isInteger(n) && n >= 1 && n <= count && !out[n - 1]) out[n - 1] = text;
    else unnumbered.push(text);
  }
  for (const t of unnumbered) {
    const gap = out.findIndex((v) => !v);
    if (gap < 0) break;
    out[gap] = t;
  }
  return out;
}

async function writeOverlays(supabase: SupabaseClient, post: Post, imageUrls: string[], caption: string): Promise<string[]> {
  const count = post.overlay_scope === "all" && imageUrls.length > 1 ? Math.min(imageUrls.length, 10) : 1;
  const [promptRes, voiceText] = await Promise.all([
    post.overlay_prompt_id
      ? supabase.from("prompts").select("content").eq("id", post.overlay_prompt_id).eq("user_id", post.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadVoice(supabase, post),
  ]);
  const custom = ((promptRes.data as { content: string } | null)?.content || "").trim();
  const topic = post.topic_name || "";
  const guide = custom
    ? fill(custom, topic, voiceText).replace(/\{\{\s*photo_count\s*\}\}/gi, String(count))
    : count > 1 ? DEFAULT_OVERLAY_CAROUSEL : DEFAULT_OVERLAY_SINGLE;

  const system = [
    "You write the short text that is printed on top of Instagram photos.",
    "Text must be readable at a glance on a phone: plain words, no hashtags, no emojis, no web addresses, no quotation marks around it, at most 90 characters per photo.",
    `There ${count > 1 ? `are ${count} photos` : "is 1 photo"}. Return exactly ${count} entr${count > 1 ? "ies" : "y"} in "photos", one per photo, numbered with "photo" from 1 to ${count} in order.`,
    'Put only the words to print in "text". Do not include labels like "Slide 1:" or "Photo 2 -".',
    "The user's instructions decide what the text says. If they describe a different output format, ignore that part and use this format.",
    `Example: {"photos":[{"photo":1,"text":"..."}${count > 1 ? ',{"photo":2,"text":"..."}' : ""}]}`,
  ].join("\n");

  const userText = [
    `Topic: ${topic || "(match the photos)"}`,
    count > 1 ? `This is a carousel of ${count} photos. The photos are attached in order (photo 1 first).` : "The photo is attached.",
    `Instructions for the photo text:\n${guide}`,
    caption.trim() ? `The post caption, for context (do not repeat it word for word):\n${caption.trim().slice(0, 1500)}` : "",
  ].filter(Boolean).join("\n\n");

  const photos = imageUrls.slice(0, count);
  const withPhotos = (text: string): Content => [
    { type: "text", text },
    ...photos.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } })),
  ];
  const ask = async (text: string) => {
    try {
      return await chatJson<unknown>(system, withPhotos(text), PHOTO_TEXT_SCHEMA);
    } catch (e) {
      if (!photos.length) throw e;
      return await chatJson<unknown>(system, text, PHOTO_TEXT_SCHEMA);
    }
  };

  let texts = parsePhotoTexts(await ask(userText), count);
  const missing = texts.map((t, i) => (t ? 0 : i + 1)).filter(Boolean);
  if (missing.length) {
    const retry = parsePhotoTexts(
      await ask(`${userText}\n\nYour previous answer was missing text for photo ${missing.join(", ")}. Return all ${count} entries again.`),
      count,
    );
    texts = texts.map((t, i) => t || retry[i]);
  }
  if (!texts.some(Boolean)) throw new Error("AI returned no photo text");
  return texts;
}

async function generatePost(supabase: SupabaseClient, postId: string, parts: Parts, instructions = ""): Promise<Row> {
  const { data, error } = await supabase.from("instagram_scheduled_posts").select("*").eq("id", postId).maybeSingle();
  if (error || !data) throw new Error("Post not found");
  const post = data as Post;
  try {
    const update: Row = { generation_status: "done", generation_error: null, updated_at: new Date().toISOString() };
    let urls = post.media_urls;
    let caption = post.caption;
    let mediaChanged = false;
    let captionWritten = false;

    if (parts === "all" || parts === "media" || urls.length === 0) {
      const picked = await pickMedia(supabase, post, parts === "media");
      urls = picked.map((a) => a.cloudfront_url);
      update.media_asset_ids = picked.map((a) => a.id);
      update.media_urls = urls;
      mediaChanged = true;
    }

    if (parts === "all" || parts === "caption" || !post.caption.trim()) {
      const written = await writeCaption(supabase, post, urls, parts === "overlay" ? "" : instructions);
      update.caption = written.caption;
      update.hashtags = written.hashtags;
      caption = written.caption;
      captionWritten = true;
    }

    const hasOverlay = post.overlay_mode === "ai" ? (post.overlay_texts || []).some((t) => t.trim()) || post.overlay_text.trim() : true;
    const wantOverlay =
      parts === "overlay" ? post.overlay_mode !== "none" :
      post.overlay_mode === "ai" && (parts === "all" || (mediaChanged && post.overlay_scope === "all") || (captionWritten && !hasOverlay));
    if (wantOverlay) {
      const texts = await writeOverlays(supabase, post, urls, caption);
      update.overlay_texts = texts;
      update.overlay_text = texts[0];
    }

    const { data: saved, error: saveErr } = await supabase.from("instagram_scheduled_posts").update(update).eq("id", postId).select("*").maybeSingle();
    if (saveErr || !saved) throw new Error("Could not save the generated post");
    return saved as Row;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    await supabase.from("instagram_scheduled_posts").update({
      generation_status: "failed",
      generation_error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    throw e;
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
    const body = await req.json().catch(() => ({})) as { action?: string; post_id?: string; parts?: string; instructions?: string };

    if (body.action === "generate") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!body.post_id) return json({ error: "Missing post_id" }, 400);
      const parts: Parts = body.parts === "caption" || body.parts === "media" || body.parts === "overlay" ? body.parts : "all";
      const instructions = typeof body.instructions === "string" ? body.instructions.slice(0, 2000) : "";

      const { data: post } = await supabase.from("instagram_scheduled_posts").select("id, user_id, status, generation_status").eq("id", body.post_id).maybeSingle();
      if (!post || post.user_id !== user.id) return json({ error: "Post not found" }, 404);
      if (post.status === "published" || post.status === "publishing") return json({ error: "This post has already been published" }, 400);
      if (post.generation_status === "generating") return json({ error: "This post is already being written" }, 409);

      await supabase.from("instagram_scheduled_posts").update({ generation_status: "generating", generation_started_at: new Date().toISOString(), generation_error: null }).eq("id", post.id);
      try {
        const saved = await generatePost(supabase, post.id, parts, instructions);
        return json({ post: saved });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Generation failed" }, 500);
      }
    }

    const { data: claimed, error: claimErr } = await supabase.rpc("instagram_claim_generation", { p_limit: TICK_BATCH });
    if (claimErr) return json({ error: claimErr.message }, 500);
    const ids = ((claimed || []) as unknown[]).map((r) => (typeof r === "string" ? r : (r as Row).instagram_claim_generation ?? (r as Row).id)) as string[];

    const results = await Promise.allSettled(ids.map((id) => generatePost(supabase, id, "all")));
    return json({
      processed: ids.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    });
  } catch (e) {
    console.error("instagram-content-engine error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
