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

/**
 * Copies an object within S3 by downloading it and re-uploading to the target key.
 * Used to move content between folders (scheduled, posted) in the bucket.
 */
async function copyS3Object(
  sourceUrl: string,
  bucket: string,
  targetKey: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  contentType: string,
): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to download source: ${response.status}`);
  const buffer = await response.arrayBuffer();

  const presignedUrl = await generatePresignedPutUrl(bucket, targetKey, accessKeyId, secretAccessKey, region);
  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  });

  if (!uploadResponse.ok) throw new Error(`Failed to upload to target: ${uploadResponse.status}`);
  return targetKey;
}

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

    const body = await req.json().catch(() => ({}));
    const { variation_id, action } = body as { variation_id?: string; action?: string };

    if (!variation_id) {
      return new Response(JSON.stringify({ error: "Missing variation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionType = action || 'publish';

    // Load the variation
    const { data: variation, error: varError } = await supabase
      .from("instagram_post_variations")
      .select("*")
      .eq("id", variation_id)
      .maybeSingle();

    if (varError || !variation) {
      return new Response(JSON.stringify({ error: "Variation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';
    const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";

    if (actionType === 'schedule') {
      if (BUCKET_NAME && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
        const ext = variation.s3_key.split('.').pop() || 'jpg';
        const scheduledKey = `instagram/scheduled/${variation.user_id}/${variation_id}.${ext}`;
        try {
          await copyS3Object(
            variation.cloudfront_url,
            BUCKET_NAME,
            scheduledKey,
            AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY,
            AWS_REGION,
            variation.s3_key.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
          );
          const newUrl = `https://${CLOUDFRONT_DOMAIN}/${scheduledKey}`;
          await supabase
            .from("instagram_post_variations")
            .update({
              s3_key: scheduledKey,
              cloudfront_url: newUrl,
              status: 'scheduled',
              updated_at: new Date().toISOString(),
            })
            .eq("id", variation_id);
        } catch (e) {
          console.error("Failed to copy to scheduled folder:", e);
        }
      }

      return new Response(JSON.stringify({ success: true, status: 'scheduled' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Publish action
    // Load the Instagram account
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("id, ig_user_id, username, page_scoped_id")
      .eq("id", variation.account_id)
      .maybeSingle();

    if (!account || !account.ig_user_id) {
      return new Response(JSON.stringify({ error: "Instagram account not found or not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to publishing
    await supabase
      .from("instagram_post_variations")
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq("id", variation_id);

    // Get the page access token — stored on the account record
    const { data: accountFull } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("id", variation.account_id)
      .maybeSingle();

    const accessToken = (accountFull as Record<string, unknown>)?.access_token as string | undefined;

    if (!accessToken) {
      throw new Error('No access token found for this Instagram account');
    }

    // Step 1: Create a media container
    const isVideo = variation.s3_key.endsWith('.mp4') || variation.s3_key.endsWith('.mov');
    const mediaType = isVideo ? 'VIDEO' : 'IMAGE';
    const fullCaption = `${variation.caption}\n\n${(variation.hashtags || []).join(' ')}`.trim();

    const createMediaUrl = `https://graph.facebook.com/v21.0/${account.ig_user_id}/media`;
    const mediaParams = new URLSearchParams({
      access_token: accessToken,
      media_type: mediaType,
      image_url: variation.cloudfront_url,
      caption: fullCaption,
    });

    const mediaResponse = await fetch(createMediaUrl, {
      method: 'POST',
      body: mediaParams,
    });

    if (!mediaResponse.ok) {
      const errText = await mediaResponse.text();
      throw new Error(`Failed to create media container: ${errText}`);
    }

    const mediaResult = await mediaResponse.json();
    const creationId = mediaResult.id;

    // For videos, wait for processing
    if (isVideo) {
      let processingDone = false;
      let attempts = 0;
      while (!processingDone && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const statusUrl = `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${accessToken}`;
        const statusResponse = await fetch(statusUrl);
        if (statusResponse.ok) {
          const statusResult = await statusResponse.json();
          if (statusResult.status_code === 'FINISHED') processingDone = true;
          else if (statusResult.status_code === 'ERROR') throw new Error('Video processing failed');
        }
        attempts++;
      }
    }

    // Step 2: Publish the media container
    const publishUrl = `https://graph.facebook.com/v21.0/${account.ig_user_id}/media_publish`;
    const publishParams = new URLSearchParams({
      access_token: accessToken,
      creation_id: creationId,
    });

    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      body: publishParams,
    });

    if (!publishResponse.ok) {
      const errText = await publishResponse.text();
      throw new Error(`Failed to publish media: ${errText}`);
    }

    const publishResult = await publishResponse.json();
    const mediaId = publishResult.media_id || publishResult.id;

    // Get permalink
    let permalink = '';
    try {
      const permalinkUrl = `https://graph.facebook.com/v21.0/${mediaId}?fields=permalink&access_token=${accessToken}`;
      const permalinkResponse = await fetch(permalinkUrl);
      if (permalinkResponse.ok) {
        const permalinkResult = await permalinkResponse.json();
        permalink = permalinkResult.permalink || '';
      }
    } catch (e) {
      console.error("Failed to get permalink:", e);
    }

    // Move content to posted folder in S3
    if (BUCKET_NAME && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
      const ext = variation.s3_key.split('.').pop() || 'jpg';
      const postedKey = `instagram/posted/${variation.user_id}/${mediaId}.${ext}`;
      try {
        await copyS3Object(
          variation.cloudfront_url,
          BUCKET_NAME,
          postedKey,
          AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY,
          AWS_REGION,
          isVideo ? 'video/mp4' : 'image/jpeg',
        );
      } catch (e) {
        console.error("Failed to copy to posted folder:", e);
      }
    }

    // Update variation to published
    await supabase
      .from("instagram_post_variations")
      .update({
        status: 'published',
        ig_media_id: mediaId,
        permalink: permalink,
        updated_at: new Date().toISOString(),
      })
      .eq("id", variation_id);

    return new Response(JSON.stringify({
      success: true,
      media_id: mediaId,
      permalink: permalink,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("publish-instagram-post error:", error);

    // Try to mark the variation as failed
    try {
      const body = await req.clone().json().catch(() => ({}));
      const { variation_id } = body as { variation_id?: string };
      if (variation_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { persistSession: false } },
        );
        await supabase
          .from("instagram_post_variations")
          .update({
            status: 'failed',
            error_message: error.message,
            retry_count: 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", variation_id);
      }
    } catch (e) {
      console.error("Failed to mark variation as failed:", e);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
