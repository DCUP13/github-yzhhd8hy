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

/**
 * Generates a pre-signed PUT URL for uploading a file directly to S3.
 * Uses AWS Signature Version 4 with the project's existing AWS_ACCESS_KEY_ID
 * and AWS_SECRET_ACCESS_KEY edge function secrets.
 */
async function generatePresignedPutUrl(
  bucket: string,
  key: string,
  contentType: string,
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
  queryParams.set('X-Amz-SignedHeaders', 'content-type;host');

  const sortedParams = Array.from(queryParams.entries()).sort();
  const canonicalQueryString = sortedParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  const canonicalUri = '/' + key.split('/').map(part => encodeURIComponent(part)).join('/');
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  const finalParams = new URLSearchParams();
  finalParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  finalParams.set('X-Amz-Credential', `${accessKeyId}/${credentialScope}`);
  finalParams.set('X-Amz-Date', amzDate);
  finalParams.set('X-Amz-Expires', '3600');
  finalParams.set('X-Amz-SignedHeaders', 'content-type;host');
  finalParams.set('X-Amz-Signature', signature);

  return `https://${host}${canonicalUri}?${finalParams.toString()}`;
}

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
    const { file_name, content_type, folder } = body as {
      file_name?: string;
      content_type?: string;
      folder?: string;
    };

    if (!file_name || !content_type) {
      return new Response(JSON.stringify({ error: "Missing file_name or content_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';
    const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");

    if (!BUCKET_NAME) {
      return new Response(JSON.stringify({ error: "S3 bucket name not configured. Set S3_BUCKET_NAME as an edge function secret." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "AWS credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine the S3 key path
    const targetFolder = folder || 'library';
    const ext = file_name.split('.').pop() || 'bin';
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const s3Key = `instagram/${targetFolder}/${user.id}/${uniqueName}`;

    const presignedUrl = await generatePresignedPutUrl(
      BUCKET_NAME,
      s3Key,
      content_type,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
      AWS_REGION,
    );

    const cloudfrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;

    return new Response(JSON.stringify({
      upload_url: presignedUrl,
      s3_key: s3Key,
      cloudfront_url: cloudfrontUrl,
      file_name: file_name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-s3-upload-url error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
