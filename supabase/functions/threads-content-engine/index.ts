import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TICK_BATCH = 6;
const MAX_CHARS = 500;

type Parts = "all" | "text" | "photos";

interface Post {
  id: string;
  user_id: string;
  slot_id: string | null;
  link_id: string | null;
  prompt_id: string | null;
  thread_prompt: string | null;
  topic_id: string | null;
  topic_name: string | null;
  voice_sample_id: string | null;
  content_text: string;
  photo_mode: "none" | "library" | "upload";
  photo_count: number;
  media_urls: string[];
  media_asset_ids: string[];
  status: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function writeText(system: string, user: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("AI writing is not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.85,
      max_tokens: 600,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "thread_post",
          strict: true,
          schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
        },
      },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI returned an empty response");
  const parsed = JSON.parse(content) as { text?: string };
  if (typeof parsed.text !== "string" || !parsed.text.trim()) throw new Error("AI returned an empty post");
  return parsed.text.trim();
}

function fill(template: string, topic: string, voice: string): string {
  return template.replaceAll("{{topic}}", topic || "a topic of your choice").replaceAll("{{voice}}", voice || "friendly and natural");
}

async function pickPhotos(supabase: SupabaseClient, post: Post): Promise<{ ids: string[]; urls: string[] }> {
  const { data: recent } = await supabase
    .from("threads_posts")
    .select("media_asset_ids")
    .eq("user_id", post.user_id)
    .neq("id", post.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const used = new Set((recent || []).flatMap((r) => (r.media_asset_ids as string[]) || []));
  const { data: assets, error } = await supabase
    .from("media_assets")
    .select("id, cloudfront_url")
    .eq("user_id", post.user_id)
    .eq("file_type", "image")
    .not("cloudfront_url", "is", null)
    .limit(500);
  if (error) throw new Error("Could not load your photo library");
  const all = (assets || []) as { id: string; cloudfront_url: string }[];
  if (!all.length) throw new Error("Your Instagram content library has no photos yet");
  const fresh = all.filter((a) => !used.has(a.id));
  const pool = (fresh.length >= post.photo_count ? fresh : all).sort(() => Math.random() - 0.5);
  const picked = pool.slice(0, Math.max(1, Math.min(post.photo_count, 10)));
  return { ids: picked.map((a) => a.id), urls: picked.map((a) => a.cloudfront_url) };
}

async function generatePost(supabase: SupabaseClient, id: string, parts: Parts, instructions = "") {
  const fail = async (msg: string) => {
    await supabase.from("threads_posts").update({ generation_status: "failed", generation_error: msg, updated_at: new Date().toISOString() }).eq("id", id);
    throw new Error(msg);
  };

  try {
    const { data: postRow } = await supabase.from("threads_posts").select("*").eq("id", id).maybeSingle();
    if (!postRow) throw new Error("Post not found");
    const post = postRow as Post;
    const patch: Record<string, unknown> = {};

    if (parts !== "text" && post.photo_mode === "library") {
      const photos = await pickPhotos(supabase, post);
      patch.media_asset_ids = photos.ids;
      patch.media_urls = photos.urls;
    }

    if (parts !== "photos") {
      const [slot, prompt, voice, link] = await Promise.all([
        post.slot_id ? supabase.from("threads_plan_slots").select("thread_prompt, extra_instructions").eq("id", post.slot_id).maybeSingle() : Promise.resolve({ data: null }),
        post.prompt_id ? supabase.from("prompts").select("content").eq("id", post.prompt_id).eq("user_id", post.user_id).maybeSingle() : Promise.resolve({ data: null }),
        post.voice_sample_id ? supabase.from("threads_voice_samples").select("content").eq("id", post.voice_sample_id).eq("user_id", post.user_id).maybeSingle() : Promise.resolve({ data: null }),
        post.link_id ? supabase.from("threads_links").select("url").eq("id", post.link_id).eq("user_id", post.user_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const topic = post.topic_name || "";
      const voiceText = (voice.data as { content?: string } | null)?.content?.trim() || "";
      const linkUrl = (link.data as { url?: string } | null)?.url || "";
      const budget = MAX_CHARS - (linkUrl ? linkUrl.length + 2 : 0) - 10;
      const base = post.thread_prompt?.trim()
        || (slot.data as { thread_prompt?: string } | null)?.thread_prompt?.trim()
        || (prompt.data as { content?: string } | null)?.content?.trim()
        || "Write an engaging Threads post about {{topic}}.";
      const extra = (slot.data as { extra_instructions?: string } | null)?.extra_instructions?.trim() || "";

      const system = [
        "You write posts for Threads (Meta's text-first social app).",
        `Hard limit: the post must be at most ${budget} characters including spaces and line breaks.`,
        "Write in a conversational, human tone. Short paragraphs. No hashtags unless asked (at most one if used). No markdown, no quotation marks around the post.",
        linkUrl ? "A link will be added automatically at the end, so do not include any URL." : "Do not include URLs.",
        post.photo_mode !== "none" ? "The post will include photos, so the text can reference them naturally." : "",
        'Return JSON: {"text": "..."}',
      ].filter(Boolean).join("\n");
      const user = [
        fill(base, topic, voiceText),
        topic ? `Topic: ${topic}` : "",
        voiceText ? `Match the style of this writing sample:\n${voiceText.slice(0, 3000)}` : "",
        extra ? `Extra instructions: ${extra}` : "",
        instructions ? `Additional instructions for this version: ${instructions}` : "",
        parts === "all" && post.content_text.trim() ? `Previous draft (write a fresh version):\n${post.content_text}` : "",
      ].filter(Boolean).join("\n\n");

      let text = await writeText(system, user);
      if (text.length > budget) {
        text = await writeText(system, `Shorten this to at most ${budget} characters while keeping the meaning:\n\n${text}`);
      }
      if (text.length > budget) text = text.slice(0, budget - 1).replace(/\s+\S*$/, "") + "…";
      patch.content_text = text;
    }

    const { data: saved, error } = await supabase
      .from("threads_posts")
      .update({ ...patch, generation_status: "done", generation_error: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error || !saved) throw new Error("Could not save the post");
    return saved;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Generation failed");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({})) as { action?: string; post_id?: string; parts?: string; instructions?: string };

    if (body.action === "generate") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!body.post_id) return json({ error: "Missing post_id" }, 400);
      const parts: Parts = body.parts === "text" || body.parts === "photos" ? body.parts : "all";
      const instructions = typeof body.instructions === "string" ? body.instructions.slice(0, 2000) : "";

      const { data: post } = await supabase.from("threads_posts").select("id, user_id, status, generation_status").eq("id", body.post_id).maybeSingle();
      if (!post || post.user_id !== user.id) return json({ error: "Post not found" }, 404);
      if (!["draft", "scheduled", "failed"].includes(post.status)) return json({ error: "This post has already been published" }, 400);
      if (post.generation_status === "generating") return json({ error: "This post is already being written" }, 409);

      await supabase.from("threads_posts").update({ generation_status: "generating", generation_started_at: new Date().toISOString(), generation_error: null }).eq("id", post.id);
      try {
        return json({ post: await generatePost(supabase, post.id, parts, instructions) });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Generation failed" }, 500);
      }
    }

    const { data: claimed, error: claimErr } = await supabase.rpc("threads_claim_generation", { p_limit: TICK_BATCH });
    if (claimErr) return json({ error: claimErr.message }, 500);
    const ids = ((claimed || []) as unknown[]).map((r) => (typeof r === "string" ? r : (r as Record<string, string>).threads_claim_generation ?? (r as Record<string, string>).id));
    const results = await Promise.allSettled(ids.map((id) => generatePost(supabase, id, "all")));
    return json({ processed: ids.length, succeeded: results.filter((r) => r.status === "fulfilled").length });
  } catch (e) {
    console.error("threads-content-engine error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
