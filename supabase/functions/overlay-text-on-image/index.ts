import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import { Resvg } from "npm:@resvg/resvg-js@2.6.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';

const FONTS: Record<string, string> = {
  'Inter': 'system-ui, -apple-system, sans-serif',
  'Georgia': 'Georgia, "Times New Roman", serif',
  'Courier': '"Courier New", monospace',
  'Impact': 'Impact, "Arial Black", sans-serif',
  'Palatino': 'Palatino, "Palatino Linotype", serif',
  'Arial': 'Arial, Helvetica, sans-serif',
  'Verdana': 'Verdana, Geneva, sans-serif',
  'Trebuchet': '"Trebuchet MS", sans-serif',
};

const FONT_WEIGHTS: Record<string, string> = {
  'Inter': '600',
  'Georgia': '700',
  'Courier': '700',
  'Impact': '400',
  'Palatino': '700',
  'Arial': '700',
  'Verdana': '700',
  'Trebuchet': '700',
};

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

/**
 * Downloads an image, overlays text on it using SVG compositing, and returns the PNG buffer.
 */
async function overlayTextOnImage(
  imageUrl: string,
  text: string,
  fontName: string,
): Promise<Uint8Array> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`);
  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());

  // Detect image dimensions from the buffer
  let width = 1080;
  let height = 1080;
  if (imageBuffer.length >= 24) {
    // JPEG: SOF0 marker
    if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
      for (let i = 2; i < imageBuffer.length - 9; i++) {
        if (imageBuffer[i] === 0xFF && (imageBuffer[i + 1] === 0xC0 || imageBuffer[i + 1] === 0xC2)) {
          height = (imageBuffer[i + 5] << 8) | imageBuffer[i + 6];
          width = (imageBuffer[i + 7] << 8) | imageBuffer[i + 8];
          break;
        }
      }
    }
    // PNG
    else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      width = (imageBuffer[16] << 24) | (imageBuffer[17] << 16) | (imageBuffer[18] << 8) | imageBuffer[19];
      height = (imageBuffer[20] << 24) | (imageBuffer[21] << 16) | (imageBuffer[22] << 8) | imageBuffer[23];
    }
  }

  const base64Image = btoa(String.fromCharCode(...imageBuffer));
  const mimeType = imageUrl.match(/\.(png)$/i) ? 'image/png' : 'image/jpeg';

  const fontFamily = FONTS[fontName] || FONTS['Impact'];
  const fontWeight = FONT_WEIGHTS[fontName] || '700';

  // Font size relative to image width
  const fontSize = Math.round(width * 0.06);
  const maxCharsPerLine = Math.floor(width / (fontSize * 0.55));
  const textLines = wrapText(text, maxCharsPerLine);

  const lineHeight = fontSize * 1.3;
  const totalTextHeight = textLines.length * lineHeight;
  const startY = height - totalTextHeight - (height * 0.08);

  // Build SVG with semi-transparent background bar behind text
  const bgPadding = fontSize * 0.4;
  const bgRectY = startY - bgPadding;
  const bgRectHeight = totalTextHeight + bgPadding * 2;

  const textElements = textLines.map((line, i) => {
    const y = startY + (i * lineHeight) + fontSize;
    return `<text x="${width / 2}" y="${y}" font-family='${escapeXml(fontFamily)}' font-size="${fontSize}" font-weight="${fontWeight}" fill="white" text-anchor="middle" dominant-baseline="alphabetic">${escapeXml(line)}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="data:${mimeType};base64,${base64Image}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bgRectY}" width="${width}" height="${bgRectHeight}" fill="rgba(0,0,0,0.45)"/>
  ${textElements}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const rendered = resvg.render().asPng();
  return new Uint8Array(rendered);
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
    const { source_url, text, font_name, target_folder } = body as {
      source_url?: string; text?: string; font_name?: string; target_folder?: string;
    };

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

    const selectedFont = font_name || 'Impact';
    const pngBuffer = await overlayTextOnImage(source_url, text.trim(), selectedFont);

    const folder = target_folder || 'posts';
    const uniqueName = `${crypto.randomUUID()}.png`;
    const s3Key = `instagram/${folder}/${user.id}/${uniqueName}`;

    await uploadToS3Signed(BUCKET_NAME, s3Key, pngBuffer, 'image/png', AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);

    const cloudfrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;

    return new Response(JSON.stringify({
      cloudfront_url: cloudfrontUrl,
      s3_key: s3Key,
      font_used: selectedFont,
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
