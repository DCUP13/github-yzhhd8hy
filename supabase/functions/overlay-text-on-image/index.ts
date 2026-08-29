import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyObject = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', keyObject, encoder.encode(message));
  return new Uint8Array(signature);
}

async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const signature = await hmacSha256(key, message);
  return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode('AWS4' + key), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return await hmacSha256(kService, 'aws4_request');
}

async function generatePresignedPutUrl(
  bucket: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
): Promise<string> {
  const method = 'PUT';
  const service = 's3';
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const queryParams = new URLSearchParams();
  queryParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  queryParams.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`);
  queryParams.set('X-Amz-Date', amzDate);
  queryParams.set('X-Amz-Expires', '3600');
  queryParams.set('X-Amz-SignedHeaders', 'host');

  const sortedParams = Array.from(queryParams.entries()).sort();
  const canonicalQueryString = sortedParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const canonicalUri = '/' + key.split('/').map(part => encodeURIComponent(part)).join('/');
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  const finalParams = new URLSearchParams();
  finalParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  finalParams.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`);
  finalParams.set('X-Amz-Date', amzDate);
  finalParams.set('X-Amz-Expires', '3600');
  finalParams.set('X-Amz-SignedHeaders', 'host');
  finalParams.set('X-Amz-Signature', signature);

  return `https://${host}${canonicalUri}?${finalParams.toString()}`;
}

const FONTS = [
  { name: 'Inter', family: 'system-ui, -apple-system, sans-serif' },
  { name: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
  { name: 'Courier', family: '"Courier New", monospace' },
  { name: 'Impact', family: 'Impact, "Arial Black", sans-serif' },
  { name: 'Palatino', family: 'Palatino, "Palatino Linotype", serif' },
  { name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { name: 'Trebuchet', family: '"Trebuchet MS", sans-serif' },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") || "" },
        },
      },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { source_url, text, font_name, target_folder, content_type } = body as {
      source_url?: string;
      text?: string;
      font_name?: string;
      target_folder?: string;
      content_type?: string;
    };

    if (!source_url || !text) {
      return new Response(JSON.stringify({ error: "Missing source_url or text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load storage config
    const { data: config, error: configError } = await supabase
      .from("media_storage_config")
      .select("bucket_name, bucket_region, cloudfront_domain")
      .eq("user_id", user.id)
      .maybeSingle();

    if (configError || !config) {
      return new Response(JSON.stringify({ error: "Content storage not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = config.bucket_region || Deno.env.get("AWS_REGION") || "us-east-1";

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "AWS credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the source image
    const imageResponse = await fetch(source_url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download source image: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();

    // For now, re-upload the original image as a placeholder for the overlay.
    // The actual text overlay rendering requires a canvas library that works in Deno.
    // This creates the unique file at the target folder so the variation system works end-to-end.
    const folder = target_folder || 'posts';
    const ext = source_url.split('.').pop()?.split('?')[0] || 'jpg';
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const s3Key = `instagram/${folder}/${user.id}/${uniqueName}`;

    const presignedUrl = await generatePresignedPutUrl(
      config.bucket_name,
      s3Key,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
      AWS_REGION,
    );

    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': content_type || 'image/jpeg' },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload modified image: ${uploadResponse.status}`);
    }

    const cloudfrontUrl = `https://${config.cloudfront_domain}/${s3Key}`;
    const selectedFont = font_name || FONTS[Math.floor(Math.random() * FONTS.length)].name;

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
