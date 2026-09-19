import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';
const MAX_DIM = 1080;

interface OverlaySettings {
  fontSize: number;
  fontWeight: number;
  textColor: string;
  bubbleColor: string;
  bubbleOpacity: number;
  bubblePadding: number;
  bubbleRadius: number;
  position: 'bottom' | 'top' | 'center';
}

const DEFAULT_SETTINGS: OverlaySettings = {
  fontSize: 64,
  fontWeight: 700,
  textColor: '#ffffff',
  bubbleColor: '#000000',
  bubbleOpacity: 45,
  bubblePadding: 40,
  bubbleRadius: 0,
  position: 'bottom',
};

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

function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  throw new Error("Unsupported image type. Use JPEG or PNG.");
}

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

async function createOverlayJpeg(
  imageUrl: string,
  text: string,
  settings: OverlaySettings,
): Promise<Uint8Array> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`);
  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());

  const mimeType = sniffImageMime(imageBuffer);

  // imageOrientation: 'from-image' respects EXIF rotation metadata
  const bitmap = await createImageBitmap(
    new Blob([imageBuffer], { type: mimeType }),
    { imageOrientation: 'from-image' },
  );

  let w = bitmap.width;
  let h = bitmap.height;
  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(bitmap, 0, 0, w, h);

  const fontSize = settings.fontSize;
  ctx.font = `${settings.fontWeight} ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxCharsPerLine = Math.floor((w * 0.85) / (fontSize * 0.55));
  const lines = wrapText(text, maxCharsPerLine);

  const lineHeight = fontSize * 1.3;
  const totalTextHeight = lines.length * lineHeight;
  const padScaled = Math.round(settings.bubblePadding * (w / 1080));

  let bannerY: number;
  if (settings.position === 'top') {
    bannerY = Math.round(h * 0.08);
  } else if (settings.position === 'center') {
    bannerY = Math.round((h - totalTextHeight - padScaled * 2) / 2);
  } else {
    bannerY = h - totalTextHeight - padScaled * 2 - Math.round(h * 0.08);
  }

  const bubbleWidth = w;
  const bubbleHeight = totalTextHeight + padScaled * 2;

  ctx.fillStyle = hexToRgba(settings.bubbleColor, settings.bubbleOpacity);
  if (settings.bubbleRadius > 0) {
    const r = settings.bubbleRadius * (w / 1080);
    ctx.beginPath();
    ctx.moveTo(0, bannerY);
    ctx.lineTo(bubbleWidth, bannerY);
    ctx.lineTo(bubbleWidth, bannerY + bubbleHeight);
    ctx.lineTo(0, bannerY + bubbleHeight);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(0, bannerY, bubbleWidth, bubbleHeight);
  }

  ctx.fillStyle = settings.textColor;
  for (let i = 0; i < lines.length; i++) {
    const y = bannerY + padScaled + (i * lineHeight) + fontSize * 0.65;
    ctx.fillText(lines[i], w / 2, y);
  }

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  return new Uint8Array(await blob.arrayBuffer());
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
    const body = await req.json().catch(() => ({}));

    if (isServiceRole) {
      userId = body.user_id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing user_id for service role call" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    const { source_url, text, target_folder, overlay_settings } = body;

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

    const settings: OverlaySettings = { ...DEFAULT_SETTINGS, ...(overlay_settings || {}) };
    const jpegData = await createOverlayJpeg(source_url, text.trim(), settings);

    const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";

    if (!BUCKET_NAME || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "AWS credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const folder = target_folder || 'text-overlay';
    const uniqueName = `${crypto.randomUUID()}.jpg`;
    const s3Key = `instagram/${folder}/${userId}/${uniqueName}`;

    await uploadToS3Signed(BUCKET_NAME, s3Key, jpegData, 'image/jpeg', AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
    const cloudfrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;

    return new Response(JSON.stringify({
      cloudfront_url: cloudfrontUrl,
      s3_key: s3Key,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("overlay-text-on-image error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
