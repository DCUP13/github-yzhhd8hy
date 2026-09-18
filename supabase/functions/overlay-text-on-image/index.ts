import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';

let fontLoaded = false;

async function ensureFont(): Promise<void> {
  if (fontLoaded) return;
  const fontUrl = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff2";
  const fontResp = await fetch(fontUrl);
  if (!fontResp.ok) throw new Error(`Failed to download font: ${fontResp.status}`);
  const fontData = await fontResp.arrayBuffer();
  const fontFace = new FontFace('Inter', fontData);
  await fontFace.load();
  (globalThis as any).fonts?.add(fontFace);
  fontLoaded = true;
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
      const { source_url, text, font_name, target_folder } = body;
      return await processOverlay(source_url, text, font_name, target_folder, userId);
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
      const body = await req.json().catch(() => ({}));
      const { source_url, text, font_name, target_folder } = body;
      return await processOverlay(source_url, text, font_name, target_folder, userId);
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

  await ensureFont();

  const imageResponse = await fetch(source_url);
  if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`);
  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
  const mimeType = source_url.match(/\.(png)$/i) ? 'image/png' : 'image/jpeg';

  const blob = new Blob([imageBuffer], { type: mimeType });
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any);

  const width = bitmap.width;
  const height = bitmap.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const fontSize = Math.round(width * 0.06);
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxWidth = width * 0.85;
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const lineHeight = fontSize * 1.3;
  const totalTextHeight = lines.length * lineHeight;
  const startY = height - totalTextHeight - (height * 0.08);
  const bgPadding = fontSize * 0.4;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, startY - bgPadding, width, totalTextHeight + bgPadding * 2);

  ctx.fillStyle = 'white';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, startY + i * lineHeight + fontSize);
  }

  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  const pngBuffer = new Uint8Array(await pngBlob.arrayBuffer());

  const folder = target_folder || 'posts';
  const uniqueName = `${crypto.randomUUID()}.png`;
  const s3Key = `instagram/${folder}/${userId}/${uniqueName}`;

  await uploadToS3Signed(BUCKET_NAME, s3Key, pngBuffer, 'image/png', AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
  const cloudfrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;

  return new Response(JSON.stringify({
    cloudfront_url: cloudfrontUrl,
    s3_key: s3Key,
    font_used: selectedFont,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
