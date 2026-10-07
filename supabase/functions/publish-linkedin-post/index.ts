import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LINKEDIN_API_BASE = "https://api.linkedin.com";
const RESTLI_HEADERS = {
  "Authorization": "",
  "Content-Type": "application/json",
  "X-Restli-Protocol-Version": "2.0.0",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await req.json().catch(() => ({}));
  } catch {
    // Body already consumed or invalid
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { post_id, action } = requestBody as {
      post_id?: string;
      action?: string;
    };

    if (!post_id) {
      return new Response(JSON.stringify({ error: "Missing post_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the post
    const { data: post, error: postError } = await supabase
      .from("linkedin_posts")
      .select("*")
      .eq("id", post_id)
      .maybeSingle();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the account
    const { data: account, error: accountError } = await supabase
      .from("linkedin_accounts")
      .select("*")
      .eq("user_id", post.user_id)
      .maybeSingle();

    if (accountError || !account || !account.connected) {
      return new Response(JSON.stringify({ error: "LinkedIn account not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = account.access_token as string;
    const personUrn = account.person_urn as string;

    if (!accessToken || !personUrn) {
      return new Response(JSON.stringify({ error: "LinkedIn account missing token or person URN" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as publishing
    await supabase.from("linkedin_posts")
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq("id", post_id);

    const headers = {
      ...RESTLI_HEADERS,
      "Authorization": `Bearer ${accessToken}`,
    };

    // Determine the share media category
    const hasImage = !!post.image_url;
    const hasArticle = !!post.article_url;
    const shareMediaCategory = hasImage ? "IMAGE" : (hasArticle ? "ARTICLE" : "NONE");

    // Build media array
    let media: Array<Record<string, unknown>> = [];

    if (hasImage) {
      // Step 1: Register the image upload
      const registerBody = {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      };

      const registerRes = await fetch(`${LINKEDIN_API_BASE}/v2/assets?action=registerUpload`, {
        method: "POST",
        headers,
        body: JSON.stringify(registerBody),
      });

      if (!registerRes.ok) {
        const errText = await registerRes.text();
        throw new Error(`Failed to register image upload: ${errText.slice(0, 300)}`);
      }

      const registerData = await registerRes.json();
      const uploadUrl = registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
      const assetUrn = registerData.value?.asset;

      if (!uploadUrl || !assetUrn) {
        throw new Error("LinkedIn did not return upload URL or asset URN");
      }

      // Step 2: Upload the image binary
      const imageRes = await fetch(post.image_url);
      if (!imageRes.ok) {
        throw new Error(`Failed to download image from ${post.image_url}`);
      }
      const imageBuffer = new Uint8Array(await imageRes.arrayBuffer());

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
        body: imageBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload image to LinkedIn: ${errText.slice(0, 300)}`);
      }

      media = [{
        status: "READY",
        media: assetUrn,
        description: post.article_description ? { text: post.article_description } : undefined,
        title: post.article_title ? { text: post.article_title } : undefined,
      }];
    } else if (hasArticle) {
      media = [{
        status: "READY",
        originalUrl: post.article_url,
        description: post.article_description ? { text: post.article_description } : undefined,
        title: post.article_title ? { text: post.article_title } : undefined,
      }];
    }

    // Step 3: Create the UGC post
    const ugcBody = {
      author: personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: post.content_text || "",
          },
          shareMediaCategory,
          ...(media.length > 0 ? { media } : {}),
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": post.visibility || "PUBLIC",
      },
    };

    const postRes = await fetch(`${LINKEDIN_API_BASE}/v2/ugcPosts`, {
      method: "POST",
      headers,
      body: JSON.stringify(ugcBody),
    });

    if (!postRes.ok) {
      const errText = await postRes.text();
      let friendlyMsg = `LinkedIn API rejected the post: ${errText.slice(0, 300)}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.status === 401 || errJson?.message?.includes("token")) {
          friendlyMsg = "Your LinkedIn access token is invalid or expired. Please reconnect your LinkedIn account.";
        }
      } catch { /* use default */ }
      throw new Error(friendlyMsg);
    }

    // The post URN is in the X-RestLi-Id response header
    const postUrn = postRes.headers.get("X-RestLi-Id") || "";
    let permalink = "";

    // Try to get the permalink — LinkedIn doesn't always provide this immediately
    if (postUrn) {
      try {
        const permalinkRes = await fetch(`${LINKEDIN_API_BASE}/v2/ugcPosts/${encodeURIComponent(postUrn)}?projection=*(specificContent*(com.linkedin.ugc.ShareContent*(shareCommentary(text),shareMediaCategory,media*(originalUrl,description*(text),title*(text),media~*(playableStreams~*(elements~*(identifier,bitRate,mediaType,bitrate),data:lastModifiedAt)))))),firstPublishedAt,lifecycleState,lastModifiedAt,visibility*(com.linkedin.ugc.MemberNetworkVisibility))`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (permalinkRes.ok) {
          const permalinkData = await permalinkRes.json();
          // The activity URN can be used to construct a permalink
          const activityUrn = permalinkData.activityUrn || "";
          if (activityUrn) {
            const activityId = activityUrn.split(":").pop();
            if (activityId) {
              permalink = `https://www.linkedin.com/feed/update/${activityUrn.replace("urn:li:activity:", "urn:li:activity:")}/`;
            }
          }
        }
      } catch (e) {
        console.error("Failed to get permalink:", e);
      }
    }

    await supabase.from("linkedin_posts")
      .update({
        status: 'published',
        linkedin_post_urn: postUrn,
        permalink,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post_id);

    return new Response(JSON.stringify({ success: true, post_urn: postUrn, permalink }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("publish-linkedin-post error:", error);
    const { post_id } = requestBody as { post_id?: string };
    if (post_id) {
      try {
        await supabase.from("linkedin_posts")
          .update({ status: 'failed', error_message: error.message, updated_at: new Date().toISOString() })
          .eq("id", post_id);
      } catch (e) {
        console.error("Failed to mark post as failed:", e);
      }
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
