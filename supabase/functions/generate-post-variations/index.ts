import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import OpenAI from "npm:openai@4.28.0";
import { Resvg } from "npm:@resvg/resvg-wasm@2.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';
const FONTS = ['Inter', 'Georgia', 'Courier', 'Impact', 'Palatino', 'Arial', 'Verdana', 'Trebuchet'];

let wasmInitialized = false;
async function ensureWasmInit() {
  if (wasmInitialized) return;
  // @resvg/resvg-wasm requires the WASM file; we fetch it from the npm CDN
  const wasmUrl = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.0.1/index_bg.wasm";
  const wasmResponse = await fetch(wasmUrl);
  const wasmBuffer = await wasmResponse.arrayBuffer();
  // The WASM init API expects a Response object or ArrayBuffer
  await (Resvg as any).init(new Uint8Array(wasmBuffer));
  wasmInitialized = true;
}

const SVG_FONTS: Record<string, string> = {
  'Inter': 'sans-serif',
  'Georgia': 'serif',
  'Courier': 'monospace',
  'Impact': 'sans-serif',
  'Palatino': 'serif',
  'Arial': 'sans-serif',
  'Verdana': 'sans-serif',
  'Trebuchet': 'sans-serif',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function detectImageDimensions(buf: Uint8Array): { width: number; height: number } {
  let width = 1080;
  let height = 1080;
  if (buf.length >= 24) {
    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      for (let i = 2; i < buf.length - 9; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
          height = (buf[i + 5] << 8) | buf[i + 6];
          width = (buf[i + 7] << 8) | buf[i + 8];
          break;
        }
      }
    }
    // PNG
    else if (buf[0] === 0x89 && buf[1] === 0x50) {
      width = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      height = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
    }
  }
  return { width, height };
}

async function overlayTextOnImageBuffer(
  imageUrl: string,
  text: string,
  fontName: string,
): Promise<Uint8Array> {
  await ensureWasmInit();

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`);
  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
  const { width, height } = detectImageDimensions(imageBuffer);

  const base64Image = btoa(String.fromCharCode(...imageBuffer));
  const mimeType = imageUrl.match(/\.(png)$/i) ? 'image/png' : 'image/jpeg';
  const fontFamily = SVG_FONTS[fontName] || 'sans-serif';

  const fontSize = Math.round(width * 0.06);
  const maxCharsPerLine = Math.floor(width / (fontSize * 0.55));
  const textLines = wrapText(text, maxCharsPerLine);

  const lineHeight = fontSize * 1.3;
  const totalTextHeight = textLines.length * lineHeight;
  const startY = height - totalTextHeight - (height * 0.08);
  const bgPadding = fontSize * 0.4;
  const bgRectY = startY - bgPadding;
  const bgRectHeight = totalTextHeight + bgPadding * 2;

  const textElements = textLines.map((line, i) => {
    const y = startY + (i * lineHeight) + fontSize;
    return `<text x="${width / 2}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(line)}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="data:${mimeType};base64,${base64Image}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bgRectY}" width="${width}" height="${bgRectHeight}" fill="rgba(0,0,0,0.45)"/>
  ${textElements}
</svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const rendered = resvg.render().asPng();
  return new Uint8Array(rendered);
}

async function uploadOverlayImage(
  sourceUrl: string,
  text: string,
  fontName: string,
  targetFolder: string,
  userId: string,
): Promise<{ s3Key: string; cloudfrontUrl: string }> {
  const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");
  const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
  const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";

  if (!BUCKET_NAME || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }

  const pngBuffer = await overlayTextOnImageBuffer(sourceUrl, text, fontName);
  const uniqueName = `${crypto.randomUUID()}.png`;
  const s3Key = `instagram/${targetFolder}/${userId}/${uniqueName}`;

  // Upload the PNG (reuse the S3 signing logic from copyAssetToNewPath)
  const method = 'PUT';
  const service = 's3';
  const host = `${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const headers: Record<string, string> = {
    'content-type': 'image/png',
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalUri = '/' + s3Key.split('/').map(p => encodeURIComponent(p)).join('/');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const encoder = new TextEncoder();
  const canonicalHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const canonicalRequestHash = Array.from(new Uint8Array(canonicalHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');

  const kDateKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', encoder.encode('AWS4' + AWS_SECRET_ACCESS_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode(dateStamp)));
  })();
  const kRegionKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', kDateKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode(AWS_REGION)));
  })();
  const kServiceKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', kRegionKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode(service)));
  })();
  const signingKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', kServiceKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode('aws4_request')));
  })();

  const signatureBuffer = await crypto.subtle.sign('HMAC',
    await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    encoder.encode(stringToSign));
  const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const s3Response = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'Authorization': authorizationHeader },
    body: pngBuffer,
  });

  if (!s3Response.ok) {
    const errText = await s3Response.text();
    throw new Error(`S3 upload failed (${s3Response.status}): ${errText.slice(0, 200)}`);
  }

  return {
    s3Key,
    cloudfrontUrl: `https://${CLOUDFRONT_DOMAIN}/${s3Key}`,
  };
}

function fillPlaceholders(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  result = result.replace(/\{\{\w+\}\}/g, '');
  return result;
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  return shuffleArray(arr).slice(0, count);
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 1000,
  });
  const raw = completion.choices[0]?.message?.content ?? '';
  return raw.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
}

/**
 * Downloads an asset from CloudFront and re-uploads it to a new S3 path
 * with a unique filename. This ensures each account gets its own copy
 * with a distinct filename even when using the same source image.
 */
async function copyAssetToNewPath(
  sourceUrl: string,
  bucket: string,
  targetFolder: string,
  userId: string,
  contentType: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
): Promise<{ s3Key: string; cloudfrontUrl: string }> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to download source: ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());

  const ext = sourceUrl.split('.').pop()?.split('?')[0] || 'jpg';
  const uniqueName = `${crypto.randomUUID()}.${ext}`;
  const s3Key = `instagram/${targetFolder}/${userId}/${uniqueName}`;

  // Use unsigned payload for simplicity when copying
  const method = 'PUT';
  const service = 's3';
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const headers: Record<string, string> = {
    'content-type': contentType,
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalUri = '/' + s3Key.split('/').map(p => encodeURIComponent(p)).join('/');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  // Hash canonical request
  const encoder = new TextEncoder();
  const canonicalHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const canonicalRequestHash = Array.from(new Uint8Array(canonicalHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');

  // Derive signing key
  const kDateKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', encoder.encode('AWS4' + secretAccessKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode(dateStamp)));
  })();
  const kRegionKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', kDateKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode(region)));
  })();
  const kServiceKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', kRegionKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode(service)));
  })();
  const signingKey = await (async () => {
    const keyObj = await crypto.subtle.importKey('raw', kServiceKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', keyObj, encoder.encode('aws4_request')));
  })();

  const signatureBuffer = await crypto.subtle.sign('HMAC',
    await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    encoder.encode(stringToSign));
  const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const s3Url = `https://${host}${canonicalUri}`;
  const s3Response = await fetch(s3Url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorizationHeader,
    },
    body: buffer,
  });

  if (!s3Response.ok) {
    const errText = await s3Response.text();
    throw new Error(`S3 copy failed (${s3Response.status}): ${errText.slice(0, 200)}`);
  }

  return {
    s3Key,
    cloudfrontUrl: `https://${CLOUDFRONT_DOMAIN}/${s3Key}`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { batch_id } = body as { batch_id?: string };

    if (!batch_id) {
      return new Response(JSON.stringify({ error: "Missing batch_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the batch
    const { data: batch, error: batchError } = await supabase
      .from("instagram_post_batches")
      .select("*")
      .eq("id", batch_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (batchError || !batch) {
      return new Response(JSON.stringify({ error: "Batch not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("instagram_post_batches")
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq("id", batch_id);

    // Load library assets
    let assets: Array<{ id: string; cloudfront_url: string; s3_key: string; file_type: string; file_name: string; mime_type: string | null; transcript: string | null }> = [];

    if (batch.use_whole_library) {
      // Select randomly from the entire library
      const { data: allAssets } = await supabase
        .from("media_assets")
        .select("id, cloudfront_url, s3_key, file_type, file_name, mime_type, transcript")
        .eq("user_id", user.id);
      assets = allAssets || [];
    } else {
      // Use the manually selected assets
      const assetIds = batch.selected_asset_ids || [];
      const { data: selectedAssets } = await supabase
        .from("media_assets")
        .select("id, cloudfront_url, s3_key, file_type, file_name, mime_type, transcript")
        .in("id", assetIds)
        .eq("user_id", user.id);
      assets = selectedAssets || [];
    }

    if (assets.length === 0) {
      return new Response(JSON.stringify({ error: "No library assets available. Upload content to your library first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load Instagram accounts
    const { data: accounts } = await supabase
      .from("instagram_accounts")
      .select("id, username, profile_picture_url, user_id")
      .eq("user_id", user.id);

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ error: "No Instagram accounts connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load account_assignments from the batch (per-account process + schedule)
    const accountAssignments: Array<{
      account_id: string;
      process_id: string | null;
      scheduled_for: string | null;
    }> = batch.account_assignments || [];

    // If account_assignments is populated, only use those accounts; otherwise fall
    // back to the old behavior of slicing all accounts by preview_count.
    const assignedAccountIds = accountAssignments.map(a => a.account_id);
    let targetAccounts: typeof accounts;
    if (assignedAccountIds.length > 0) {
      targetAccounts = accounts.filter(a => assignedAccountIds.includes(a.id));
    } else {
      const previewCount = Math.min(batch.preview_count || accounts.length, accounts.length);
      targetAccounts = accounts.slice(0, previewCount);
    }

    // Load any referenced post processes in one query
    const processIds = accountAssignments
      .map(a => a.process_id)
      .filter((id): id is string => id !== null);
    let postProcessesMap = new Map<string, Record<string, unknown>>();
    if (processIds.length > 0) {
      const { data: processes } = await supabase
        .from("instagram_post_processes")
        .select("*")
        .in("id", processIds)
        .eq("user_id", user.id);
      for (const p of processes || []) {
        postProcessesMap.set(p.id, p);
      }
    }

    // Determine the batch-level AI prompt source (fallback when no process assigned)
    let batchPromptContent: string | null = null;
    if (batch.custom_prompt && batch.custom_prompt.trim()) {
      batchPromptContent = batch.custom_prompt;
    } else if (batch.prompt_id) {
      const { data: promptRow } = await supabase
        .from("prompts")
        .select("content")
        .eq("id", batch.prompt_id)
        .eq("user_id", user.id)
        .maybeSingle();
      batchPromptContent = promptRow?.content || null;
    }

    const batchSettings = batch.variation_settings || {};
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
    const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");

    // Delete existing variations for this batch
    await supabase.from("instagram_post_variations").delete().eq("batch_id", batch_id);

    const variations: Array<Record<string, unknown>> = [];

    for (let i = 0; i < targetAccounts.length; i++) {
      const account = targetAccounts[i];

      // Find this account's assignment, if any
      const assignment = accountAssignments.find(a => a.account_id === account.id);
      const process = assignment?.process_id ? postProcessesMap.get(assignment.process_id) : null;

      // Resolve per-account settings: process overrides batch defaults
      let baseCaption = batch.base_caption || '';
      let hashtagsArr = batch.hashtags || [];
      let contentType = batch.content_type || 'post';
      let cSize = batch.carousel_size || 1;
      let cTextLines = batch.carousel_text_lines || [];
      let useAICaption = batchSettings.caption !== false;
      let shuffleHashtags = batchSettings.hashtags !== false;
      let varyFontFlag = batchSettings.font !== false;
      let promptContent = batchPromptContent;
      const batchPostNow = batch.post_now || false;
      let accountScheduledFor: string | null = null;

      if (process) {
        baseCaption = (process.base_caption as string) || baseCaption;
        hashtagsArr = (process.hashtags as string[]) || hashtagsArr;
        contentType = (process.content_type as string) || contentType;
        cSize = (process.carousel_size as number) || cSize;
        cTextLines = (process.carousel_text_lines as string[]) || cTextLines;
        const pSettings = (process.variation_settings as Record<string, boolean>) || {};
        useAICaption = pSettings.caption !== false;
        shuffleHashtags = pSettings.hashtags !== false;
        varyFontFlag = pSettings.font !== false;

        // Resolve process-level prompt
        const pMode = (process.prompt_mode as string) || 'none';
        if (pMode === 'custom' && process.custom_prompt) {
          promptContent = process.custom_prompt as string;
        } else if (pMode === 'select' && process.prompt_id) {
          const { data: pPromptRow } = await supabase
            .from("prompts")
            .select("content")
            .eq("id", process.prompt_id)
            .eq("user_id", user.id)
            .maybeSingle();
          promptContent = pPromptRow?.content || null;
        } else {
          promptContent = null;
        }
      }

      // Per-account schedule from assignment; post_now is batch-level
      if (assignment) {
        accountScheduledFor = assignment.scheduled_for;
      }

      // Pick random assets for this carousel — different random selection per account
      const carouselAssets = pickRandom(assets, Math.min(cSize, assets.length));

      // Generate caption variation
      let caption = baseCaption;
      if (useAICaption && promptContent && baseCaption) {
        try {
          const captionVars: Record<string, string> = {
            original_caption: baseCaption,
            account_name: account.username || '',
            hashtags: hashtagsArr.join(' '),
            variation_style: 'lightly rephrased, same meaning, different wording',
            transcript: carouselAssets[0]?.transcript || '',
          };
          const filled = fillPlaceholders(promptContent, captionVars);
          caption = await callAI(
            "You are an AI assistant generating a unique Instagram caption variation. Keep it natural, engaging, and professional. Do not include hashtags in the caption — they are handled separately.",
            filled,
          );
        } catch (e) {
          console.error("AI caption generation failed, using original:", e);
          caption = baseCaption;
        }
      }

      // Shuffle hashtags
      let hashtags = hashtagsArr;
      if (shuffleHashtags && hashtags.length > 1) {
        hashtags = shuffleArray(hashtags);
      }

      // Select font
      const fontUsed = varyFontFlag ? FONTS[Math.floor(Math.random() * FONTS.length)] : null;

      // For each carousel image, copy it to a new S3 path with a unique filename
      // If text overlay is configured for this slide, render the text onto the image
      const carouselUrls: string[] = [];
      const carouselS3Keys: string[] = [];

      for (let j = 0; j < carouselAssets.length; j++) {
        const asset = carouselAssets[j];

        const targetFolder = contentType === 'reel' ? 'reels' : 'posts';
        const assetContentType = asset.mime_type || (asset.file_type === 'video' ? 'video/mp4' : 'image/jpeg');
        const textForSlide = cTextLines[j]?.trim() || '';

        try {
          if (BUCKET_NAME && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
            const copied = await copyAssetToNewPath(
              asset.cloudfront_url,
              BUCKET_NAME,
              targetFolder,
              user.id,
              assetContentType,
              AWS_ACCESS_KEY_ID,
              AWS_SECRET_ACCESS_KEY,
              AWS_REGION,
            );

            // If this slide has text and it's an image (not video), overlay the text
            if (textForSlide && asset.file_type !== 'video') {
              try {
                const overlayFont = fontUsed || 'Impact';
                const overlayResult = await uploadOverlayImage(
                  copied.cloudfrontUrl,
                  textForSlide,
                  overlayFont,
                  targetFolder,
                  user.id,
                );
                carouselUrls.push(overlayResult.cloudfrontUrl);
                carouselS3Keys.push(overlayResult.s3Key);
              } catch (overlayErr) {
                console.error(`Text overlay error for slide ${j}:`, overlayErr);
                carouselUrls.push(copied.cloudfrontUrl);
                carouselS3Keys.push(copied.s3Key);
              }
            } else {
              carouselUrls.push(copied.cloudfrontUrl);
              carouselS3Keys.push(copied.s3Key);
            }
          } else {
            carouselUrls.push(asset.cloudfront_url);
            carouselS3Keys.push(asset.s3_key);
          }
        } catch (e) {
          console.error(`Failed to copy asset ${asset.id}:`, e);
          carouselUrls.push(asset.cloudfront_url);
          carouselS3Keys.push(asset.s3_key);
        }
      }

      const primaryUrl = carouselUrls[0] || '';
      const primaryS3Key = carouselS3Keys[0] || '';

      const variationStatus = batchPostNow ? 'staged' : (accountScheduledFor ? 'scheduled' : 'staged');

      variations.push({
        batch_id: batch_id,
        user_id: user.id,
        account_id: account.id,
        cloudfront_url: primaryUrl,
        s3_key: primaryS3Key,
        carousel_urls: carouselUrls,
        caption: caption,
        hashtags: hashtags,
        font_used: fontUsed,
        carousel_texts: cTextLines,
        source_filename: carouselAssets[0]?.file_name || null,
        status: variationStatus,
        scheduled_for: accountScheduledFor,
      });
    }

    // Insert all variations
    if (variations.length > 0) {
      const { error: insertError } = await supabase
        .from("instagram_post_variations")
        .insert(variations);
      if (insertError) throw insertError;
    }

    // Update batch status
    const anyScheduled = variations.some(v => v.status === 'scheduled');
    const finalBatchStatus = anyScheduled ? 'scheduled' : 'ready';
    await supabase
      .from("instagram_post_batches")
      .update({ status: finalBatchStatus, updated_at: new Date().toISOString() })
      .eq("id", batch_id);

    // Return the inserted variation IDs so the client can publish them directly.
    // Publishing from within this function via server-to-server fetch was unreliable
    // and left variations stuck in 'publishing' forever.
    let publishedVariationIds: string[] = [];
    if (batch.post_now) {
      const inserted = await supabase
        .from("instagram_post_variations")
        .select("id, account_id")
        .eq("batch_id", batch_id);
      if (inserted.data) {
        const publishSet = new Set(variations.map(v => v.account_id));
        publishedVariationIds = inserted.data
          .filter(v => publishSet.has(v.account_id))
          .map(v => v.id);
      }
    }

    // For variations with a scheduled_for time, trigger scheduling via the publish function
    const scheduledVariations = variations.filter(v => v.status === 'scheduled' && v.scheduled_for);
    if (scheduledVariations.length > 0) {
      const insertedVariations = await supabase
        .from("instagram_post_variations")
        .select("id, account_id, scheduled_for")
        .eq("batch_id", batch_id);

      if (insertedVariations.data) {
        for (const v of insertedVariations.data) {
          if (!v.scheduled_for) continue;
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-instagram-post`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                'apikey': Deno.env.get("SUPABASE_ANON_KEY")!,
              },
              body: JSON.stringify({ variation_id: v.id, action: 'schedule' }),
            });
          } catch (e) {
            console.error(`Schedule failed for ${v.id}:`, e);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      variations_created: variations.length,
      posted_immediately: 0,
      publish_variation_ids: publishedVariationIds,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-post-variations error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
