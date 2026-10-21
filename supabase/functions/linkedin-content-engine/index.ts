import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.39.7";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = "d292js7mlprar.cloudfront.net";
const ARCTIC_BASE = "https://arctic-shift.photon-reddit.com/api";
const TICK_BATCH = 3;
const FALLBACK_SUBREDDITS = ["Entrepreneur", "smallbusiness", "marketing", "artificial"];

type Parts = "all" | "post" | "guide";

interface Sample { id: string; name: string; content: string }

interface Source {
  title: string;
  subreddit: string;
  score: number;
  num_comments: number;
  url: string;
  excerpt: string;
  top_comments: string[];
}

interface Guide {
  title: string;
  subtitle: string;
  intro: string;
  sections: { heading: string; paragraphs: string[]; bullets: string[] }[];
  key_takeaways: string[];
  closing: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- S3 upload (SigV4) ----------

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}

async function uploadToS3(key: string, body: Uint8Array, contentType: string): Promise<string> {
  const bucket = Deno.env.get("S3_BUCKET_NAME");
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secret = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_REGION") || "us-east-1";
  if (!bucket || !accessKeyId || !secret) throw new Error("File storage is not configured");

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const payloadHash = await sha256Hex(body);
  const headers: Record<string, string> = {
    "content-type": contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const keys = Object.keys(headers).sort();
  const canonicalHeaders = keys.map((k) => `${k}:${headers[k]}\n`).join("");
  const signedHeaders = keys.join(";");
  const uri = "/" + key.split("/").map(encodeURIComponent).join("/");
  const canonicalRequest = ["PUT", uri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  let signingKey = await hmac(new TextEncoder().encode("AWS4" + secret), dateStamp);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, "s3");
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = Array.from(await hmac(signingKey, stringToSign)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const res = await fetch(`https://${host}${uri}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Guide upload failed (${res.status})`);
  return `https://${CLOUDFRONT_DOMAIN}/${key}`;
}

// ---------- OpenAI ----------

async function chatJson<T>(system: string, user: string, maxTokens = 3000, temperature = 0.8): Promise<T> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("AI writing is not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature,
      max_tokens: maxTokens,
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

// ---------- Reddit research (Arctic Shift) ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function arctic<T>(path: string): Promise<T[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${ARCTIC_BASE}${path}`, { signal: AbortSignal.timeout(25000) });
      const body = await res.json().catch(() => null);
      if (res.ok && body && Array.isArray(body.data)) return body.data as T[];
    } catch (_e) {
      // network/timeout - retry once
    }
    await sleep(1500);
  }
  return [];
}

async function poolMap<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

interface RawPost { id: string; title: string; selftext?: string; score: number; num_comments: number; subreddit: string }

async function researchReddit(topic: string, prompt: string): Promise<{ subreddits: string[]; sources: Source[] }> {
  const plan = await chatJson<{ subreddits?: string[]; search_phrases?: string[] }>(
    "You pick Reddit communities and search phrases for research. Return JSON {\"subreddits\": string[], \"search_phrases\": string[]}.",
    `Research topic: "${topic}"\nWriter's instructions: ${prompt || "(none)"}\n\nChoose 6 active subreddits (names only, no r/ prefix) where people genuinely discuss this topic or closely related problems. They do not need to contain the topic words. Also give 2 short search phrases (1-3 words each) capturing related ideas people would use in post titles.`,
    400,
    0.4,
  );

  const candidates = (plan.subreddits || []).map((s) => String(s).replace(/^\/?r\//i, "").trim()).filter(Boolean).slice(0, 6);
  const verified: string[] = [];
  for (const name of candidates) {
    if (verified.length >= 4) break;
    const found = await arctic<{ display_name: string }>(`/subreddits/search?subreddit=${encodeURIComponent(name)}&fields=display_name,subscribers&limit=1`);
    if (found.length > 0) verified.push(found[0].display_name);
  }
  const subreddits = verified.length > 0 ? verified : FALLBACK_SUBREDDITS;

  const phrases = (plan.search_phrases || []).map((p) => String(p).trim()).filter(Boolean).slice(0, 2);
  const queries = [topic, ...phrases.filter((p) => p.toLowerCase() !== topic.toLowerCase())];

  const fields = "id,title,selftext,score,num_comments,subreddit";
  const searches = subreddits.flatMap((sub) => queries.map((q) => ({ sub, q })));
  const results = await poolMap(searches, 2, ({ sub, q }) =>
    arctic<RawPost>(`/posts/search?subreddit=${encodeURIComponent(sub)}&query=${encodeURIComponent(q)}&after=${isoDaysAgo(90)}&limit=100&fields=${fields}`)
  );
  let posts = results.flat();

  if (posts.length < 5) {
    const wider = await poolMap(subreddits.slice(0, 2), 2, (sub) =>
      arctic<RawPost>(`/posts/search?subreddit=${encodeURIComponent(sub)}&query=${encodeURIComponent(topic)}&after=${isoDaysAgo(365)}&limit=100&fields=${fields}`)
    );
    posts = posts.concat(wider.flat());
  }

  const seen = new Set<string>();
  const ranked = posts
    .filter((p) => p && p.id && p.title && !seen.has(p.id) && seen.add(p.id))
    .filter((p) => !/^\[(removed|deleted)\]$/.test(p.selftext || ""))
    .sort((a, b) => (b.score + 2 * b.num_comments) - (a.score + 2 * a.num_comments))
    .slice(0, 8);

  const sources: Source[] = ranked.map((p) => ({
    title: p.title,
    subreddit: p.subreddit,
    score: p.score,
    num_comments: p.num_comments,
    url: `https://www.reddit.com/r/${p.subreddit}/comments/${p.id}/`,
    excerpt: (p.selftext || "").slice(0, 700),
    top_comments: [],
  }));

  await poolMap(sources.slice(0, 4), 2, async (s) => {
    const id = s.url.split("/comments/")[1].replace("/", "");
    const comments = await arctic<{ body: string; score: number }>(`/comments/search?link_id=${id}&limit=100&fields=body,score`);
    s.top_comments = comments
      .filter((c) => c.body && !/^\[(removed|deleted)\]$/.test(c.body) && !/I am a bot/i.test(c.body))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => c.body.slice(0, 400));
  });

  return { subreddits, sources };
}

// ---------- Prompt helpers ----------

const CATEGORY_BRIEF: Record<string, string> = {
  mindset: "MINDSET post: share a perspective, belief or lesson about the idea, often through a short personal story or reflection, ending with a clear takeaway or a question for the reader.",
  topical: "TEACHING post: educate the reader on the subject with practical, specific, actionable insight related to AI, business and marketing.",
  research: "RESEARCH post: build the post on what real people are discussing on Reddit (research provided). Surface patterns, pain points, surprising findings and practical lessons. Mention that this comes from real conversations, never name usernames.",
};

const GUIDE_SIZES: Record<string, { sections: number; words: number }> = {
  short: { sections: 4, words: 280 },
  medium: { sections: 7, words: 380 },
  long: { sections: 11, words: 450 },
};

function fillSamples(text: string, samples: Sample[], topic: string, primary: Sample | null): string {
  return (text || "")
    .replace(/\{\{\s*sample\s*:\s*([^}]+?)\s*\}\}/gi, (_m, name: string) => {
      const s = samples.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
      return s ? `"""\n${s.content}\n"""` : "";
    })
    .replace(/\{\{\s*voice\s*\}\}/gi, primary ? `"""\n${primary.content}\n"""` : "")
    .replace(/\{\{\s*topic\s*\}\}/gi, topic);
}

function researchBlock(summary: string | null, sources: Source[]): string {
  if (sources.length === 0 && !summary) return "";
  const lines = sources.map((s, i) =>
    `${i + 1}. r/${s.subreddit} | ${s.score} upvotes, ${s.num_comments} comments | "${s.title}"\n${s.excerpt ? `   Post: ${s.excerpt.replace(/\s+/g, " ").slice(0, 500)}\n` : ""}${s.top_comments.map((c) => `   Top comment: ${c.replace(/\s+/g, " ")}`).join("\n")}`
  );
  return `\n\nREDDIT RESEARCH${summary ? `\nSummary: ${summary}` : ""}\n${lines.join("\n")}`;
}

function voiceBlock(primary: Sample | null) {
  return primary
    ? `VOICE SAMPLE (match its tone, rhythm, sentence length, formatting and personality; never copy its content):\n"""\n${primary.content}\n"""`
    : "No voice sample provided: write in a confident, warm, conversational first-person voice.";
}

// ---------- Guide generation ----------

async function writeGuide(ctx: {
  topic: string;
  category: string;
  length: string;
  guidePrompt: string;
  primary: Sample | null;
  research: string;
}): Promise<Guide> {
  const size = GUIDE_SIZES[ctx.length] || GUIDE_SIZES.medium;
  const system = `You are an expert ghostwriter creating a long-form downloadable PDF guide for a LinkedIn audience. Write in the author's voice. Plain text only, no markdown symbols. Return JSON.\n\n${voiceBlock(ctx.primary)}`;

  const outline = await chatJson<{ title: string; subtitle: string; intro: string; sections: { heading: string; notes: string }[]; key_takeaways: string[]; closing: string }>(
    system,
    `Create the outline for a guide.\nTopic: ${ctx.topic}\nPost type: ${ctx.category}\nAuthor's structure and direction for the guide:\n${ctx.guidePrompt || "(none - choose a clear, practical structure)"}${ctx.research}\n\nReturn JSON {"title": string (max 70 chars), "subtitle": string (max 120 chars), "intro": string (130-180 words), "sections": [{"heading": string, "notes": string (what this section must cover)}] (exactly ${size.sections} sections, following the author's structure if given), "key_takeaways": string[] (5 items), "closing": string (80-120 words, ends with a soft call to connect or comment on LinkedIn)}`,
    2500,
    0.7,
  );

  const headings = (outline.sections || []).slice(0, size.sections);
  if (headings.length === 0) throw new Error("Guide outline came back empty");
  const outlineText = headings.map((s, i) => `${i + 1}. ${s.heading}`).join("\n");

  const sections = await poolMap(headings, 4, async (sec) => {
    const body = await chatJson<{ paragraphs: string[]; bullets: string[] }>(
      system,
      `Guide title: ${outline.title}\nFull outline:\n${outlineText}\n\nWrite the section "${sec.heading}". It must cover: ${sec.notes}\nAuthor's direction: ${ctx.guidePrompt || "(none)"}${ctx.research}\n\nWrite about ${size.words} words of substantive, specific content (examples, steps, frameworks). Return JSON {"paragraphs": string[] (3-6 paragraphs), "bullets": string[] (0-6 short actionable bullets, may be empty)}`,
      1800,
      0.75,
    );
    return { heading: sec.heading, paragraphs: body.paragraphs || [], bullets: body.bullets || [] };
  });

  return {
    title: outline.title || ctx.topic,
    subtitle: outline.subtitle || "",
    intro: outline.intro || "",
    sections,
    key_takeaways: outline.key_takeaways || [],
    closing: outline.closing || "",
  };
}

function pdfSafe(text: string): string {
  return (text || "")
    .replace(/\*\*|__|^#+\s*/gm, "")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u25CF\u25AA]/g, "-")
    .replace(/[\u00A0\t]/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function renderGuidePdf(guide: Guide, author: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(guide.title));
  doc.setAuthor(pdfSafe(author));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 64, CW = W - M * 2;
  const blue = rgb(0.039, 0.4, 0.761);
  const ink = rgb(0.13, 0.15, 0.18);
  const muted = rgb(0.42, 0.45, 0.5);

  // Cover
  const cover = doc.addPage([W, H]);
  cover.drawRectangle({ x: 0, y: H * 0.42, width: W, height: H * 0.58, color: blue });
  cover.drawRectangle({ x: M, y: H - 120, width: 48, height: 4, color: rgb(1, 1, 1) });
  cover.drawText("THE GUIDE", { x: M, y: H - 100, size: 11, font: bold, color: rgb(1, 1, 1) });
  let cy = H - 180;
  for (const l of wrap(guide.title, bold, 32, CW)) {
    cover.drawText(l, { x: M, y: cy, size: 32, font: bold, color: rgb(1, 1, 1) });
    cy -= 40;
  }
  cy -= 8;
  for (const l of wrap(guide.subtitle, regular, 15, CW)) {
    cover.drawText(l, { x: M, y: cy, size: 15, font: regular, color: rgb(0.88, 0.93, 1) });
    cy -= 21;
  }
  cover.drawText(pdfSafe(`By ${author}`), { x: M, y: H * 0.42 - 60, size: 14, font: bold, color: ink });
  cover.drawText(new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }), { x: M, y: H * 0.42 - 80, size: 11, font: regular, color: muted });

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (needed: number) => {
    if (y - needed < M + 20) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const paragraph = (text: string, size = 11, font = regular, color = ink, indent = 0) => {
    for (const l of wrap(text, font, size, CW - indent)) {
      ensure(size + 6);
      page.drawText(l, { x: M + indent, y, size, font, color });
      y -= size + 6;
    }
  };
  const heading = (text: string) => {
    ensure(70);
    y -= 14;
    page.drawRectangle({ x: M, y: y + 2, width: 28, height: 3, color: blue });
    y -= 22;
    for (const l of wrap(text, bold, 18, CW)) {
      page.drawText(l, { x: M, y, size: 18, font: bold, color: ink });
      y -= 24;
    }
    y -= 4;
  };
  const bullets = (items: string[]) => {
    for (const b of items) {
      const lines = wrap(b, regular, 11, CW - 18);
      ensure(17);
      page.drawCircle({ x: M + 5, y: y + 3.5, size: 2.2, color: blue });
      for (const l of lines) {
        ensure(17);
        page.drawText(l, { x: M + 18, y, size: 11, font: regular, color: ink });
        y -= 17;
      }
      y -= 3;
    }
  };

  heading("Introduction");
  for (const p of guide.intro.split(/\n\n+/)) { paragraph(p); y -= 8; }

  for (const sec of guide.sections) {
    heading(sec.heading);
    for (const p of sec.paragraphs) { paragraph(p); y -= 8; }
    if (sec.bullets.length) { y -= 2; bullets(sec.bullets); y -= 6; }
  }

  if (guide.key_takeaways.length) {
    heading("Key takeaways");
    bullets(guide.key_takeaways);
  }
  if (guide.closing) {
    heading("Final word");
    paragraph(guide.closing);
  }

  const pages = doc.getPages();
  const footerTitle = pdfSafe(guide.title).slice(0, 70);
  pages.forEach((p, i) => {
    if (i === 0) return;
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
    p.drawText(footerTitle, { x: M, y: 30, size: 8, font: regular, color: muted });
    const label = `${i + 1} / ${pages.length}`;
    p.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 8), y: 30, size: 8, font: regular, color: muted });
  });

  return await doc.save();
}

// ---------- Core: generate one post ----------

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function generatePost(supabase: SupabaseClient, postId: string, parts: Parts): Promise<Row> {
  const { data: post, error } = await supabase.from("linkedin_posts").select("*").eq("id", postId).maybeSingle();
  if (error || !post) throw new Error("Post not found");

  try {
    const [{ data: sampleRows }, { data: account }, topicRes] = await Promise.all([
      supabase.from("linkedin_voice_samples").select("id, name, content").eq("user_id", post.user_id),
      supabase.from("linkedin_accounts").select("member_name").eq("user_id", post.user_id).maybeSingle(),
      post.topic_id
        ? supabase.from("linkedin_topics").select("name").eq("id", post.topic_id).eq("user_id", post.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const samples = (sampleRows || []) as Sample[];
    const primary = samples.find((s) => s.id === post.voice_sample_id) || null;
    const topic: string = post.topic_name || topicRes.data?.name || "a timely topic in AI, business and marketing";
    const category: string = post.category || "topical";
    const prompt = fillSamples(post.generation_prompt || "", samples, topic, primary);
    const guidePrompt = fillSamples(post.guide_prompt || "", samples, topic, primary);
    const update: Row = {};

    let sources: Source[] = Array.isArray(post.research_sources) ? post.research_sources : [];
    let summary: string | null = post.research_summary;
    const needResearch = category === "research" && (parts === "all" || sources.length === 0);
    if (needResearch) {
      const r = await researchReddit(topic, prompt);
      sources = r.sources;
      summary = null;
      update.research_subreddits = r.subreddits;
      update.research_sources = sources;
    }
    const research = category === "research" ? researchBlock(summary, sources) : "";

    let guideTitle: string | null = post.guide_mode === "ai" ? post.article_title : null;
    if (post.guide_mode === "ai" && (parts === "all" || parts === "guide")) {
      const guide = await writeGuide({ topic, category, length: post.guide_length, guidePrompt, primary, research });
      const pdf = await renderGuidePdf(guide, account?.member_name || "Your LinkedIn host");
      const url = await uploadToS3(`linkedin/guides/${post.user_id}/${crypto.randomUUID()}.pdf`, pdf, "application/pdf");
      guideTitle = guide.title.trim().slice(0, 200) || "Guide";
      update.document_url = url;
      update.document_name = `${guideTitle}.pdf`;
      update.article_title = guideTitle;
    }

    if (parts !== "guide") {
      const when = post.slot_date
        ? new Date(`${post.slot_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
        : "soon";
      const result = await chatJson<{ post: string; research_summary?: string }>(
        `You are a world-class LinkedIn ghostwriter. ${voiceBlock(primary)}\n\nRules: plain text only (no markdown, no asterisks, no hashtag spam - at most 3 relevant hashtags at the end if the voice sample uses them), use short paragraphs and line breaks the way the sample does, strong first line hook, under 2800 characters. Return JSON.`,
        `${CATEGORY_BRIEF[category] || CATEGORY_BRIEF.topical}\nTopic: ${topic}\nThis post goes live on ${when}.\n\nAuthor's instructions for this post:\n${prompt || "(none)"}${research}${guideTitle ? `\n\nA PDF guide titled "${guideTitle}" is attached to this post. Reference it naturally near the end (e.g. that the full guide is attached below).` : ""}\n\nReturn JSON {"post": string${category === "research" ? ', "research_summary": string (4-6 sentences summarizing what the Reddit research revealed and which communities it came from)' : ""}}`,
        2000,
        0.85,
      );
      if (!result.post || typeof result.post !== "string") throw new Error("AI did not return a post");
      update.content_text = result.post.replace(/\*\*/g, "").slice(0, 3000);
      if (category === "research" && result.research_summary) update.research_summary = result.research_summary;
    }

    if (post.document_url && !post.article_title && !update.article_title) {
      update.article_title = String(post.document_name || "Guide").replace(/\.[a-z0-9]+$/i, "").slice(0, 200);
    }
    if (category === "research") {
      update.needs_review = true;
      update.reviewed_at = null;
    }
    update.generation_status = "done";
    update.generation_error = null;
    update.error_message = null;
    if (post.scheduled_for && ["draft", "failed", "scheduled"].includes(post.status)) update.status = "scheduled";
    update.updated_at = new Date().toISOString();

    const { data: saved, error: saveErr } = await supabase.from("linkedin_posts").update(update).eq("id", postId).select("*").maybeSingle();
    if (saveErr || !saved) throw new Error(saveErr?.message || "Failed to save post");
    return saved;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("linkedin_posts").update({
      generation_status: "failed",
      generation_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    throw e;
  }
}

// ---------- HTTP ----------

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
    const body = await req.json().catch(() => ({})) as { action?: string; post_id?: string; parts?: Parts };

    if (body.action === "generate") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!body.post_id) return json({ error: "Missing post_id" }, 400);
      const parts: Parts = body.parts === "post" || body.parts === "guide" ? body.parts : "all";

      const { data: post } = await supabase.from("linkedin_posts").select("id, user_id, status, generation_status").eq("id", body.post_id).maybeSingle();
      if (!post || post.user_id !== user.id) return json({ error: "Post not found" }, 404);
      if (post.status === "published" || post.status === "publishing") return json({ error: "This post has already been published" }, 400);
      if (post.generation_status === "generating") return json({ error: "This post is already being written" }, 409);

      await supabase.from("linkedin_posts").update({ generation_status: "generating", generation_started_at: new Date().toISOString(), generation_error: null }).eq("id", post.id);
      try {
        const saved = await generatePost(supabase, post.id, parts);
        return json({ post: saved });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Generation failed" }, 500);
      }
    }

    const { data: claimed, error: claimErr } = await supabase.rpc("linkedin_claim_generation", { p_limit: TICK_BATCH });
    if (claimErr) return json({ error: claimErr.message }, 500);
    const ids = ((claimed || []) as unknown[]).map((r) => (typeof r === "string" ? r : (r as Row).linkedin_claim_generation ?? (r as Row).id)) as string[];

    const results = await Promise.allSettled(ids.map((id) => generatePost(supabase, id, "all")));
    return json({
      processed: ids.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    });
  } catch (e) {
    console.error("linkedin-content-engine error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
