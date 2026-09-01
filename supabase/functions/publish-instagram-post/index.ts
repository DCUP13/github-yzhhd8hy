import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLOUDFRONT_DOMAIN = 'd292js7mlprar.cloudfront.net';

// Instagram Business tokens (IGA...) only work with graph.instagram.com.
// Facebook/Page tokens work with graph.facebook.com.
function graphBase(token: string): string {
  return token.startsWith('IGA')
    ? 'https://graph.instagram.com'
    : 'https://graph.facebook.com';
}

function authHeaders(token: string): Record<string, string> {
  if (token.startsWith('IGA')) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function graphUrl(url: string, token: string): string {
  if (token.startsWith('IGA')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${token}`;
}

function extractStringId(text: string): string | undefined {
  const match = text.match(/"id"\s*:\s*(?:"([^"]+)"|(\d+))/);
  return match?.[1] ?? match?.[2];
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Copies an object within S3 by downloading and re-uploading to the target key.
 */
async function copyS3Object(
  sourceUrl: string,
  bucket: string,
  targetKey: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  contentType: string,
): Promise<void> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to download source: ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());

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
  const canonicalUri = '/' + targetKey.split('/').map(p => encodeURIComponent(p)).join('/');
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
}

/** Fetch the correct ig_user_id via /me, fixing precision loss from initial storage. */
async function resolveIgUserId(
  supabase: ReturnType<typeof createClient>,
  account: Record<string, unknown>,
  accountId: string,
  accessToken: string,
): Promise<string> {
  const storedId = account.ig_user_id as string;
  if (!accessToken.startsWith('IGA')) return storedId;

  try {
    const meRes = await fetch(
      graphUrl(`https://graph.instagram.com/v26.0/me?fields=id,username`, accessToken),
      { headers: authHeaders(accessToken) },
    );
    if (meRes.ok) {
      const meText = await meRes.text();
      const meId = extractStringId(meText);
      if (meId && meId !== storedId) {
        console.log(`Correcting ig_user_id from ${storedId} to ${meId}`);
        await supabase.from("instagram_accounts").update({ ig_user_id: meId }).eq("id", accountId);
        return meId;
      }
      if (meId) return meId;
    } else {
      console.error("Failed to fetch /me:", await meRes.text());
    }
  } catch (e) {
    console.error("Failed to verify ig_user_id via /me:", e);
  }
  return storedId;
}

/** Wait for a video container to finish processing. */
async function waitForMediaReady(
  base: string,
  creationId: string,
  accessToken: string,
  label: string,
): Promise<void> {
  let done = false;
  let attempts = 0;
  const maxAttempts = 60;
  while (!done && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 3000));
    const statusUrl = graphUrl(`${base}/v26.0/${creationId}?fields=status_code`, accessToken);
    const statusResponse = await fetch(statusUrl, { headers: authHeaders(accessToken) });
    if (statusResponse.ok) {
      const statusResult = await statusResponse.json();
      const status = statusResult.status_code;
      if (status === 'FINISHED') {
        done = true;
      } else if (status === 'ERROR') {
        throw new Error(`Media processing failed for ${label}`);
      }
    }
    attempts++;
  }
  if (!done) {
    throw new Error(`Media processing timed out for ${label} after ${maxAttempts * 3}s`);
  }
}

/** Parse Graph API error and return a friendly message for common error codes. */
function friendlyGraphError(errText: string, fallback: string): string {
  try {
    const errJson = JSON.parse(errText);
    if (errJson?.error?.code === 190) {
      return 'Your Instagram access token is invalid or expired. Go to Settings > Instagram and click Reconnect to get a fresh token via Instagram Login.';
    }
    if (errJson?.error?.code === 100) {
      return `Instagram API rejected the request: ${errJson.error.message || errText.slice(0, 200)}`;
    }
    return `${fallback}: ${errText.slice(0, 300)}`;
  } catch {
    return `${fallback}: ${errText.slice(0, 300)}`;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Read the body once up front so the error handler can use it without req.clone()
  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await req.json().catch(() => ({}));
  } catch {
    // Body already consumed or invalid — continue with empty object
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { variation_id, action, asset_id, account_id, caption } = requestBody as {
      variation_id?: string;
      action?: string;
      asset_id?: string;
      account_id?: string;
      caption?: string;
    };

    const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME");
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";

    // Handle "test_post" action: publish a single library asset to a specific account immediately
    if (action === 'test_post') {
      if (!asset_id || !account_id) {
        return new Response(JSON.stringify({ error: "Missing asset_id or account_id for test post" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load the asset
      const { data: asset } = await supabase
        .from("media_assets")
        .select("*")
        .eq("id", asset_id)
        .maybeSingle();

      if (!asset) {
        return new Response(JSON.stringify({ error: "Asset not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load the account
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("id", account_id)
        .maybeSingle();

      if (!account || !account.ig_user_id) {
        return new Response(JSON.stringify({ error: "Instagram account not found or not connected" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accountRec = account as Record<string, unknown>;
      const accessToken = accountRec.access_token as string | undefined;
      const authMethod = accountRec.auth_method as string | undefined;
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "No access token for this account" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (authMethod === 'manual') {
        return new Response(JSON.stringify({ error: "This account was connected manually and its token cannot be used for posting. Go to Settings > Instagram and click Reconnect to authorize via Instagram Login." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const base = graphBase(accessToken);
      const effectiveIgUserId = await resolveIgUserId(supabase, accountRec, account_id, accessToken);

      const isVideo = asset.s3_key.endsWith('.mp4') || asset.s3_key.endsWith('.mov');
      const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

      // Create media container
      const createMediaUrl = graphUrl(`${base}/v26.0/${effectiveIgUserId}/media`, accessToken);
      const mediaParams = new URLSearchParams({
        media_type: mediaType,
        image_url: asset.cloudfront_url,
        caption: caption || 'Test post',
      });

      const mediaResponse = await fetch(createMediaUrl, {
        method: 'POST',
        headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: accessToken.startsWith('IGA') ? mediaParams : new URLSearchParams({ ...Object.fromEntries(mediaParams), access_token: accessToken }),
      });
      if (!mediaResponse.ok) {
        const errText = await mediaResponse.text();
        throw new Error(friendlyGraphError(errText, 'Failed to create media container'));
      }
      const mediaResult = await mediaResponse.json();
      const creationId = mediaResult.id;

      // Wait for video processing if needed
      if (isVideo) {
        await waitForMediaReady(base, creationId, accessToken, 'test post');
      }

      // Publish
      const publishUrl = graphUrl(`${base}/v26.0/${effectiveIgUserId}/media_publish`, accessToken);
      const publishParams = new URLSearchParams({ creation_id: creationId });
      const publishResponse = await fetch(publishUrl, {
        method: 'POST',
        headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: accessToken.startsWith('IGA') ? publishParams : new URLSearchParams({ ...Object.fromEntries(publishParams), access_token: accessToken }),
      });
      if (!publishResponse.ok) {
        const errText = await publishResponse.text();
        throw new Error(friendlyGraphError(errText, 'Failed to publish'));
      }
      const publishResult = await publishResponse.json();
      const mediaId = publishResult.media_id || publishResult.id;

      return new Response(JSON.stringify({ success: true, media_id: mediaId, is_test: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!variation_id) {
      return new Response(JSON.stringify({ error: "Missing variation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const actionType = action || 'publish';

    // Schedule action: move content to scheduled folder
    if (actionType === 'schedule') {
      if (BUCKET_NAME && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
        const ext = variation.s3_key.split('.').pop() || 'jpg';
        const scheduledKey = `instagram/scheduled/${variation.user_id}/${variation_id}.${ext}`;
        try {
          await copyS3Object(
            variation.cloudfront_url, BUCKET_NAME, scheduledKey,
            AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
            variation.s3_key.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
          );
          const newUrl = `https://${CLOUDFRONT_DOMAIN}/${scheduledKey}`;
          await supabase.from("instagram_post_variations")
            .update({ s3_key: scheduledKey, cloudfront_url: newUrl, status: 'scheduled', updated_at: new Date().toISOString() })
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
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("id", variation.account_id)
      .maybeSingle();

    if (!account || !account.ig_user_id) {
      return new Response(JSON.stringify({ error: "Instagram account not found or not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountRec = account as Record<string, unknown>;
    const accessToken = accountRec.access_token as string | undefined;
    if (!accessToken) throw new Error('No access token found for this Instagram account');

    const base = graphBase(accessToken);
    const effectiveIgUserId = await resolveIgUserId(supabase, accountRec, account.id, accessToken);

    await supabase.from("instagram_post_variations")
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq("id", variation_id);

    const fullCaption = `${variation.caption}\n\n${(variation.hashtags || []).join(' ')}`.trim();
    const carouselUrls: string[] = variation.carousel_urls || [variation.cloudfront_url];
    const isCarousel = carouselUrls.length > 1;
    const isIgToken = accessToken.startsWith('IGA');

    function buildBody(params: URLSearchParams): URLSearchParams {
      if (isIgToken) return params;
      return new URLSearchParams({ ...Object.fromEntries(params), access_token: accessToken });
    }

    let mediaId: string;

    if (isCarousel) {
      // Carousel post: create a child media container for each image, then a carousel parent
      const childIds: string[] = [];

      for (let i = 0; i < carouselUrls.length; i++) {
        const url = carouselUrls[i];
        const isVideo = url.endsWith('.mp4') || url.endsWith('.mov');
        const childParams = new URLSearchParams({
          media_type: isVideo ? 'VIDEO' : 'IMAGE',
          image_url: url,
        });

        const childResponse = await fetch(
          graphUrl(`${base}/v26.0/${effectiveIgUserId}/media`, accessToken),
          {
            method: 'POST',
            headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: buildBody(childParams),
          },
        );
        if (!childResponse.ok) {
          const errText = await childResponse.text();
          throw new Error(friendlyGraphError(errText, `Failed to create carousel child ${i}`));
        }
        const childResult = await childResponse.json();
        childIds.push(childResult.id);

        if (isVideo) {
          await waitForMediaReady(base, childResult.id, accessToken, `carousel child ${i}`);
        }
      }

      // Create carousel container
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption: fullCaption,
      });
      const carouselResponse = await fetch(
        graphUrl(`${base}/v26.0/${effectiveIgUserId}/media`, accessToken),
        {
          method: 'POST',
          headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: buildBody(carouselParams),
        },
      );
      if (!carouselResponse.ok) {
        const errText = await carouselResponse.text();
        throw new Error(friendlyGraphError(errText, 'Failed to create carousel container'));
      }
      const carouselResult = await carouselResponse.json();
      const creationId = carouselResult.id;

      await waitForMediaReady(base, creationId, accessToken, 'carousel container');

      // Publish the carousel
      const carouselPublishUrl = graphUrl(`${base}/v26.0/${effectiveIgUserId}/media_publish`, accessToken);
      const carouselPublishParams = new URLSearchParams({ creation_id: creationId });
      const publishResponse = await fetch(carouselPublishUrl, {
        method: 'POST',
        headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildBody(carouselPublishParams),
      });
      if (!publishResponse.ok) {
        const errText = await publishResponse.text();
        throw new Error(friendlyGraphError(errText, 'Failed to publish carousel'));
      }
      const publishResult = await publishResponse.json();
      mediaId = publishResult.media_id || publishResult.id;

    } else {
      // Single media post
      const isVideo = variation.s3_key.endsWith('.mp4') || variation.s3_key.endsWith('.mov');
      const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

      const createMediaUrl = graphUrl(`${base}/v26.0/${effectiveIgUserId}/media`, accessToken);
      const mediaParams = new URLSearchParams({
        media_type: mediaType,
        image_url: variation.cloudfront_url,
        caption: fullCaption,
      });
      const mediaResponse = await fetch(createMediaUrl, {
        method: 'POST',
        headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildBody(mediaParams),
      });
      if (!mediaResponse.ok) {
        const errText = await mediaResponse.text();
        throw new Error(friendlyGraphError(errText, 'Failed to create media container'));
      }
      const mediaResult = await mediaResponse.json();
      const creationId = mediaResult.id;

      await waitForMediaReady(base, creationId, accessToken, 'single post');

      const singlePublishUrl = graphUrl(`${base}/v26.0/${effectiveIgUserId}/media_publish`, accessToken);
      const singlePublishParams = new URLSearchParams({ creation_id: creationId });
      const publishResponse = await fetch(singlePublishUrl, {
        method: 'POST',
        headers: { ...authHeaders(accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildBody(singlePublishParams),
      });
      if (!publishResponse.ok) {
        const errText = await publishResponse.text();
        throw new Error(friendlyGraphError(errText, 'Failed to publish media'));
      }
      const publishResult = await publishResponse.json();
      mediaId = publishResult.media_id || publishResult.id;
    }

    // Get permalink
    let permalink = '';
    try {
      const permalinkUrl = graphUrl(`${base}/v26.0/${mediaId}?fields=permalink`, accessToken);
      const permalinkResponse = await fetch(permalinkUrl, { headers: authHeaders(accessToken) });
      if (permalinkResponse.ok) {
        const permalinkResult = await permalinkResponse.json();
        permalink = permalinkResult.permalink || '';
      }
    } catch (e) {
      console.error("Failed to get permalink:", e);
    }

    // Move content to posted folder
    if (BUCKET_NAME && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
      const ext = variation.s3_key.split('.').pop() || 'jpg';
      const postedKey = `instagram/posted/${variation.user_id}/${mediaId}.${ext}`;
      try {
        await copyS3Object(
          variation.cloudfront_url, BUCKET_NAME, postedKey,
          AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
          variation.s3_key.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
        );
      } catch (e) {
        console.error("Failed to copy to posted folder:", e);
      }
    }

    await supabase.from("instagram_post_variations")
      .update({ status: 'published', ig_media_id: mediaId, permalink, updated_at: new Date().toISOString() })
      .eq("id", variation_id);

    return new Response(JSON.stringify({ success: true, media_id: mediaId, permalink }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("publish-instagram-post error:", error);
    // Use the body we read at the top — no req.clone() needed
    const { variation_id } = requestBody as { variation_id?: string };
    if (variation_id) {
      try {
        await supabase.from("instagram_post_variations")
          .update({ status: 'failed', error_message: error.message, retry_count: 1, updated_at: new Date().toISOString() })
          .eq("id", variation_id);
      } catch (e) {
        console.error("Failed to mark variation as failed:", e);
      }
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
