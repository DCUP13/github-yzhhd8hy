import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";
import jpeg from "npm:jpeg-js@0.4.4";
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';

let wasmInitialized = false;
let cachedFontBuffer: Uint8Array | null = null;

async function ensureWasmInit() {
  if (wasmInitialized) return;
  const wasmUrl = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
  const wasmResponse = await fetch(wasmUrl);
  if (!wasmResponse.ok) throw new Error(`Failed to download WASM: ${wasmResponse.status}`);
  const wasmBuffer = await wasmResponse.arrayBuffer();
  await initWasm(new Uint8Array(wasmBuffer));
  wasmInitialized = true;
}

async function ensureFont(): Promise<Uint8Array> {
  if (cachedFontBuffer) return cachedFontBuffer;
  const fontUrl = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-700-normal.woff2";
  const fontResp = await fetch(fontUrl);
  if (!fontResp.ok) throw new Error(`Failed to download font: ${fontResp.status}`);
  cachedFontBuffer = new Uint8Array(await fontResp.arrayBuffer());
  return cachedFontBuffer;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function getExifOrientation(buf: Uint8Array): number {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return 1;
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0x00 || marker === 0xFF) { i++; continue; }
    if (marker === 0xD9 || marker === 0xDA) break;
    if (marker === 0xE1) {
      const segLen = (buf[i + 2] << 8) | buf[i + 3];
      const exifStart = i + 4;
      if (buf.length < exifStart + 6) return 1;
      if (buf[exifStart] === 0x45 && buf[exifStart + 1] === 0x78 &&
          buf[exifStart + 2] === 0x69 && buf[exifStart + 3] === 0x66 &&
          buf[exifStart + 4] === 0x00 && buf[exifStart + 5] === 0x00) {
        const tiffStart = exifStart + 6;
        if (buf.length < tiffStart + 8) return 1;
        const bigEndian = buf[tiffStart] === 0x4D;
        const read16 = (off: number) => bigEndian
          ? (buf[tiffStart + off] << 8) | buf[tiffStart + off + 1]
          : (buf[tiffStart + off + 1] << 8) | buf[tiffStart + off];
        const ifdOffset = read16(4);
        if (buf.length < tiffStart + ifdOffset + 2) return 1;
        const entryCount = read16(ifdOffset);
        for (let e = 0; e < entryCount; e++) {
          const entryOff = ifdOffset + 2 + e * 12;
          if (buf.length < tiffStart + entryOff + 12) return 1;
          const tag = read16(entryOff);
          if (tag === 0x0112) return read16(entryOff + 8);
        }
        return 1;
      }
      i += 2 + segLen;
    } else if (marker >= 0xD0 && marker <= 0xD7) {
      i += 2;
    } else {
      const segLen = (buf[i + 2] << 8) | buf[i + 3];
      i += 2 + segLen;
    }
  }
  return 1;
}

function applyOrientation(
  src: Uint8Array, srcW: number, srcH: number, orientation: number
): { data: Uint8Array; width: number; height: number } {
  if (orientation === 1) return { data: src, width: srcW, height: srcH };
  let dstW = srcW, dstH = srcH;
  if (orientation >= 5 && orientation <= 8) { dstW = srcH; dstH = srcW; }
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const srcIdx = (y * srcW + x) * 4;
      let dx = x, dy = y;
      switch (orientation) {
        case 2: dx = srcW - 1 - x; break;
        case 3: dx = srcW - 1 - x; dy = srcH - 1 - y; break;
        case 4: dy = srcH - 1 - y; break;
        case 5: dx = y; dy = x; break;
        case 6: dx = srcH - 1 - y; dy = x; break;
        case 7: dx = srcH - 1 - y; dy = srcW - 1 - x; break;
        case 8: dx = y; dy = srcW - 1 - x; break;
      }
      const dstIdx = (dy * dstW + dx) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  return { data: dst, width: dstW, height: dstH };
}

function decodeImage(buf: Uint8Array): { data: Uint8Array; width: number; height: number } {
  const isPng = buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50;
  if (isPng) {
    const png = PNG.sync.read(Buffer.from(buf));
    return { data: new Uint8Array(png.data), width: png.width, height: png.height };
  }
  const orientation = getExifOrientation(buf);
  const decoded = jpeg.decode(buf, { useTArray: true });
  if (!decoded) throw new Error('Failed to decode JPEG');
  return applyOrientation(decoded.data as Uint8Array, decoded.width, decoded.height, orientation);
}

function encodePng(data: Uint8Array, width: number, height: number): Uint8Array {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return new Uint8Array(PNG.sync.write(png));
}

function compositeTextOntoImage(
  imageRgba: Uint8Array, textRgba: Uint8Array, width: number, height: number
): Uint8Array {
  const result = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height * 4; i += 4) {
    const ta = textRgba[i + 3] / 255;
    if (ta === 0) {
      result[i] = imageRgba[i];
      result[i + 1] = imageRgba[i + 1];
      result[i + 2] = imageRgba[i + 2];
      result[i + 3] = 255;
    } else {
      result[i] = Math.round(textRgba[i] * ta + imageRgba[i] * (1 - ta));
      result[i + 1] = Math.round(textRgba[i + 1] * ta + imageRgba[i + 1] * (1 - ta));
      result[i + 2] = Math.round(textRgba[i + 2] * ta + imageRgba[i + 2] * (1 - ta));
      result[i + 3] = 255;
    }
  }
  return result;
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

  // Step 1: Download image
  const imageResponse = await fetch(source_url);
  if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`);
  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());

  // Step 2: Decode to RGBA (jpeg-js for JPEG, pngjs for PNG, with EXIF rotation)
  const decoded = decodeImage(imageBuffer);
  const { data: imageRgba, width, height } = decoded;

  // Step 3: Build a text-only SVG (transparent background, just text + semi-transparent rect)
  await ensureWasmInit();
  const fontBuffer = await ensureFont();

  const fontSize = Math.round(width * 0.06);
  const maxCharsPerLine = Math.floor((width * 0.85) / (fontSize * 0.55));
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

  const lineHeight = fontSize * 1.3;
  const totalTextHeight = lines.length * lineHeight;
  const startY = height - totalTextHeight - (height * 0.08);
  const bgPadding = fontSize * 0.4;
  const bgRectY = startY - bgPadding;
  const bgRectHeight = totalTextHeight + bgPadding * 2;

  const textElements = lines.map((line, i) => {
    const y = startY + (i * lineHeight) + fontSize;
    return `<text x="${width / 2}" y="${y}" font-family="Inter" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(line)}</text>`;
  }).join('\n');

  const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="${bgRectY}" width="${width}" height="${bgRectHeight}" fill="rgba(0,0,0,0.45)"/>
  ${textElements}
</svg>`;

  // Step 4: Render text-only SVG to PNG (tiny SVG, no image data — very fast)
  const resvg = new Resvg(textSvg, {
    font: {
      fontBuffers: [fontBuffer],
      defaultFontFamily: 'Inter',
      loadSystemFonts: false,
    },
  });
  const textPngBytes = new Uint8Array(resvg.render().asPng());

  // Step 5: Decode text PNG back to RGBA
  const textPng = PNG.sync.read(Buffer.from(textPngBytes));
  const textRgba = new Uint8Array(textPng.data);

  // Step 6: Composite text layer onto image (alpha blend)
  const finalRgba = compositeTextOntoImage(imageRgba, textRgba, width, height);

  // Step 7: Encode final image to PNG
  const finalPng = encodePng(finalRgba, width, height);

  // Step 8: Upload
  const folder = target_folder || 'posts';
  const uniqueName = `${crypto.randomUUID()}.png`;
  const s3Key = `instagram/${folder}/${userId}/${uniqueName}`;

  await uploadToS3Signed(BUCKET_NAME, s3Key, finalPng, 'image/png', AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
  const cloudfrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;

  return new Response(JSON.stringify({
    cloudfront_url: cloudfrontUrl,
    s3_key: s3Key,
    font_used: selectedFont,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
