import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickColors,
  DrawableFillColor,
  DrawableFillOpacity,
  DrawableFontPointSize,
  DrawableFont,
  DrawableText,
  DrawableTextAlignment,
  DrawableRectangle,
  TextAlignment,
  Percentage,
  Magick,
} from "npm:@imagemagick/magick-wasm@0.0.29";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';
const MAX_DIM = 1080;

let magickInitialized = false;
let fontRegistered = false;

async function ensureMagickInit() {
  if (magickInitialized) return;
  const wasmUrl = "https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.29/dist/magick.wasm";
  const wasmResp = await fetch(wasmUrl);
  if (!wasmResp.ok) throw new Error(`Failed to download magick.wasm: ${wasmResp.status}`);
  const wasmBuffer = await wasmResp.arrayBuffer();
  await initializeImageMagick(new Uint8Array(wasmBuffer));
  magickInitialized = true;
}

async function ensureFont() {
  if (fontRegistered) return;
  const fontUrl = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf";
  const fontResp = await fetch(fontUrl);
  if (!fontResp.ok) throw new Error(`Failed to download font: ${fontResp.status}`);
  const fontData = new Uint8Array(await fontResp.arrayBuffer());
  Magick.addFont('DejaVuSans-Bold.ttf', fontData);
  fontRegistered = true;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function uploadToS3Signed(
  bucket: string,
  key: string,
  fileData: Uint8Array,
  contentType: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
): Promise<void> {
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
  const canonicalUri = '/' + key.split('/').map(p => encodeURIComponent(p)).join('/');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const encoder = new TextEncoder();
  const canonicalHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const canonicalRequestHash = Array.from(new Uint8Array(canonicalHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');

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

  const s3Response = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'Authorization': authorizationHeader },
    body: fileData,
  });

  if (!s3Response.ok) {
    const errText = await s3Response.text();
    throw new Error(`S3 upload failed (${s3Response.status}): ${errText.slice(0, 200)}`);
  }
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

    const authHeader = req.headers.get("Authorization") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;

    let userId: string;
    if (isServiceRole) {
      const body = await req.json().catch(() => ({}));
      userId = body.user_id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing user_id for service role call" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { source_url, text, font_name, target_folder, preview_only } = body;
      return await processOverlay(source_url, text, font_name, target_folder, userId, preview_only);
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
      const body = await req.json().catch(() => ({}));
      const { source_url, text, font_name, target_folder, preview_only } = body;
      return await processOverlay(source_url, text, font_name, target_folder, userId, preview_only);
    }
  } catch (error) {
    console.error("overlay-text-on-image error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processOverlay(
  source_url?: string,
  text?: string,
  font_name?: string,
  target_folder?: string,
  userId?: string,
  preview_only?: boolean,
): Promise<Response> {
  if (!source_url) {
    return new Response(JSON.stringify({ error: "Missing source_url" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "Missing text to overlay" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");
  const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
  const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";

  if (!BUCKET_NAME || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return new Response(JSON.stringify({ error: "AWS credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const selectedFont = font_name || 'Inter';

  // Step 1: Download image
  const imageResponse = await fetch(source_url);
  if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`);
  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());

  // Step 2: Initialize magick-wasm (single WASM module — no resvg needed)
  await ensureMagickInit();
  await ensureFont();

  // Step 3: All image processing in one magick-wasm pass:
  //   decode → auto-orient → resize → draw text overlay → encode PNG
  const resultPng = ImageMagick.read(imageBuffer, (img): Uint8Array => {
    img.autoOrient();

    let w = img.width;
    let h = img.height;
    if (w > MAX_DIM || h > MAX_DIM) {
      const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      img.resize(w, h);
    }

    const fontSize = Math.round(w * 0.06);
    const maxCharsPerLine = Math.floor((w * 0.85) / (fontSize * 0.55));
    const lines = wrapText(text!, maxCharsPerLine);

    const lineHeight = fontSize * 1.3;
    const totalTextHeight = lines.length * lineHeight;
    const startY = h - totalTextHeight - Math.round(h * 0.08);
    const bgPadding = Math.round(fontSize * 0.4);
    const bgRectY = startY - bgPadding;
    const bgRectHeight = totalTextHeight + bgPadding * 2;

    const black = MagickColors.Black;
    const white = MagickColors.White;

    const drawables: any[] = [
      // Semi-transparent black background bar
      new DrawableFillColor(black),
      new DrawableFillOpacity(new Percentage(45)),
      new DrawableRectangle(0, bgRectY, w, bgRectY + bgRectHeight),
      // Text settings
      new DrawableFillColor(white),
      new DrawableFont('DejaVuSans-Bold.ttf'),
      new DrawableFontPointSize(fontSize),
      new DrawableTextAlignment(TextAlignment.Center),
    ];

    // Draw each line of text
    for (let i = 0; i < lines.length; i++) {
      const y = startY + (i * lineHeight) + fontSize;
      const x = Math.round(w / 2);
      drawables.push(new DrawableText(x, y, lines[i]));
    }

    img.draw(drawables);

    return img.write(MagickFormat.Png, (data) => new Uint8Array(data));
  });

  // Step 4: Upload to S3 in text-overlay folder (or return base64 for preview)
  if (preview_only) {
    const base64 = bytesToBase64(new Uint8Array(resultPng));
    return new Response(JSON.stringify({
      preview_image: `data:image/png;base64,${base64}`,
      font_used: selectedFont,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const folder = target_folder || 'text-overlay';
  const uniqueName = `${crypto.randomUUID()}.png`;
  const s3Key = `instagram/${folder}/${userId}/${uniqueName}`;

  await uploadToS3Signed(BUCKET_NAME, s3Key, new Uint8Array(resultPng), 'image/png', AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
  const cloudfrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;

  return new Response(JSON.stringify({
    cloudfront_url: cloudfrontUrl,
    s3_key: s3Key,
    font_used: selectedFont,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
