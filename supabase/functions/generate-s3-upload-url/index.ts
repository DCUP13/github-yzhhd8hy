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
 * Uploads a file to S3 using a signed PUT request from the server side.
 * This avoids browser CORS issues since the edge function makes the S3 request.
 */
async function uploadToS3(
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

  // Compute the SHA-256 hash of the payload for the x-amz-content-sha256 header
  const payloadHash = await sha256(String.fromCharCode(...fileData));

  // Build canonical headers — must be sorted alphabetically by header name
  const headers: Record<string, string> = {
    'content-type': contentType,
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  // No query parameters for PUT
  const canonicalQueryString = '';

  const canonicalUri = '/' + key.split('/').map(part => encodeURIComponent(part)).join('/');

  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const s3Url = `https://${host}${canonicalUri}`;
  const s3Response = await fetch(s3Url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorizationHeader,
    },
    body: fileData,
  });

  if (!s3Response.ok) {
    const errText = await s3Response.text();
    throw new Error(`S3 upload failed (${s3Response.status}): ${errText.slice(0, 300)}`);
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

    // Accept multipart form data with the file and metadata
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileName = formData.get("file_name") as string | null;
    const contentType = (formData.get("content_type") as string | null) || file?.type || 'application/octet-stream';
    const folder = (formData.get("folder") as string | null) || 'library';

    if (!file || !fileName) {
      return new Response(JSON.stringify({ error: "Missing file or file_name in form data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';
    const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");

    if (!BUCKET_NAME) {
      return new Response(JSON.stringify({ error: "S3 bucket name not configured" }), {
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
    const ext = fileName.split('.').pop() || 'bin';
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const s3Key = `instagram/${folder}/${user.id}/${uniqueName}`;

    // Read file into a Uint8Array for upload
    const fileBuffer = new Uint8Array(await file.arrayBuffer());

    // Upload to S3 from the server side — no CORS issues
    await uploadToS3(
      BUCKET_NAME,
      s3Key,
      fileBuffer,
      contentType,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
      AWS_REGION,
    );

    const cloudfrontUrl = `https://${CLOUDFRONT_DOMAIN}/${s3Key}`;

    return new Response(JSON.stringify({
      s3_key: s3Key,
      cloudfront_url: cloudfrontUrl,
      file_name: fileName,
      file_size: file.size,
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
