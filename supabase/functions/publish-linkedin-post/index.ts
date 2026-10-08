import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LINKEDIN_API_BASE = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202401";

function authHeaders(accessToken: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "Linkedin-Version": LINKEDIN_VERSION,
    "Content-Type": "application/json",
  };
}

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

    const headers = authHeaders(accessToken);

    // --- DELETE action: remove post from LinkedIn ---
    if (action === "delete") {
      if (!post.linkedin_post_urn) {
        return new Response(JSON.stringify({ error: "Post has no LinkedIn URN to delete" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const deleteRes = await fetch(
        `${LINKEDIN_API_BASE}/rest/posts/${encodeURIComponent(post.linkedin_post_urn)}`,
        { method: "DELETE", headers },
      );

      if (!deleteRes.ok) {
        const errText = await deleteRes.text();
        return new Response(JSON.stringify({ error: `LinkedIn delete failed: ${errText.slice(0, 300)}` }), {
          status: deleteRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, deleted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- EDIT action: patch an existing LinkedIn post ---
    if (action === "edit") {
      if (!post.linkedin_post_urn) {
        return new Response(JSON.stringify({ error: "Post has no LinkedIn URN to edit" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const patchBody: Record<string, unknown> = {
        commentary: post.content_text || "",
      };

      if (post.visibility) {
        patchBody.visibility = post.visibility;
      }

      const patchRes = await fetch(
        `${LINKEDIN_API_BASE}/rest/posts/${encodeURIComponent(post.linkedin_post_urn)}`,
        { method: "PATCH", headers, body: JSON.stringify(patchBody) },
      );

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        let friendlyMsg = `LinkedIn API rejected the edit: ${errText.slice(0, 300)}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson?.status === 401 || errJson?.message?.includes("token")) {
            friendlyMsg = "Your LinkedIn access token is invalid or expired. Please reconnect your LinkedIn account.";
          }
        } catch { /* use default */ }
        throw new Error(friendlyMsg);
      }

      await supabase.from("linkedin_posts")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", post_id);

      return new Response(JSON.stringify({ success: true, edited: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- PUBLISH action (default): create a new post on LinkedIn ---
    // Mark as publishing
    await supabase.from("linkedin_posts")
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq("id", post_id);

    const hasImage = !!post.image_url;
    const hasArticle = !!post.article_url;
    const hasVideo = !!post.video_url;
    const hasDocument = !!post.document_url;

    let content: Record<string, unknown> | undefined;

    // --- Image upload via /rest/images ---
    if (hasImage) {
      const initBody = {
        initializeUploadRequest: {
          owner: personUrn,
        },
      };

      const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
        method: "POST",
        headers,
        body: JSON.stringify(initBody),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Failed to initialize image upload: ${errText.slice(0, 300)}`);
      }

      const initData = await initRes.json();
      const uploadUrl = initData.value?.uploadUrl;
      const imageUrn = initData.value?.image;

      if (!uploadUrl || !imageUrn) {
        throw new Error("LinkedIn did not return upload URL or image URN");
      }

      // Download the image and upload it
      const imageRes = await fetch(post.image_url);
      if (!imageRes.ok) {
        throw new Error(`Failed to download image from ${post.image_url}`);
      }
      const imageBuffer = new Uint8Array(await imageRes.arrayBuffer());

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}` },
        body: imageBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload image to LinkedIn: ${errText.slice(0, 300)}`);
      }

      // Poll for AVAILABLE status (max 10 attempts, 1s apart)
      let imageStatus = "WAITING_UPLOAD";
      for (let attempt = 0; attempt < 10; attempt++) {
        const statusRes = await fetch(
          `${LINKEDIN_API_BASE}/rest/images/${encodeURIComponent(imageUrn)}`,
          { headers },
        );
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          imageStatus = statusData.status || "WAITING_UPLOAD";
          if (imageStatus === "AVAILABLE") break;
          if (imageStatus === "PROCESSING_FAILED") {
            throw new Error("LinkedIn image processing failed");
          }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const mediaObj: Record<string, unknown> = { id: imageUrn };
      if (post.article_title) mediaObj.title = post.article_title;
      if (post.article_description) mediaObj.description = post.article_description;

      content = { media: mediaObj };
    }

    // --- Video upload via /rest/videos ---
    if (hasVideo) {
      // Download the video to get its size
      const videoRes = await fetch(post.video_url);
      if (!videoRes.ok) {
        throw new Error(`Failed to download video from ${post.video_url}`);
      }
      const videoBuffer = new Uint8Array(await videoRes.arrayBuffer());
      const fileSizeBytes = videoBuffer.byteLength;

      const initBody = {
        initializeUploadRequest: {
          owner: personUrn,
          fileSizeBytes,
          uploadThumbnail: false,
        },
      };

      const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/videos?action=initializeUpload`, {
        method: "POST",
        headers,
        body: JSON.stringify(initBody),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Failed to initialize video upload: ${errText.slice(0, 300)}`);
      }

      const initData = await initRes.json();
      const videoUrn = initData.value?.video;
      const uploadToken = initData.value?.uploadToken;
      const uploadInstructions = initData.value?.uploadInstructions;

      if (!videoUrn || !uploadInstructions) {
        throw new Error("LinkedIn did not return video URN or upload instructions");
      }

      // Upload video in 4MB chunks, collecting ETags
      const chunkSize = 4 * 1024 * 1024;
      const uploadedPartIds: string[] = [];

      for (const instruction of uploadInstructions) {
        const partUrl = instruction.uploadUrl;
        const partByteStart = instruction.byteRange?.firstByte ?? 0;
        const partByteEnd = instruction.byteRange?.lastByte ?? Math.min(partByteStart + chunkSize - 1, fileSizeBytes - 1);
        const chunk = videoBuffer.subarray(partByteStart, partByteEnd + 1);

        const partRes = await fetch(partUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/octet-stream" },
          body: chunk,
        });

        if (!partRes.ok) {
          const errText = await partRes.text();
          throw new Error(`Failed to upload video chunk: ${errText.slice(0, 300)}`);
        }

        const etag = partRes.headers.get("ETag") || partRes.headers.get("etag");
        if (etag) {
          uploadedPartIds.push(etag.replace(/"/g, ''));
        }
      }

      // Finalize the upload
      const finalizeBody = {
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken,
          uploadedPartIds,
        },
      };

      const finalizeRes = await fetch(`${LINKEDIN_API_BASE}/rest/videos?action=finalizeUpload`, {
        method: "POST",
        headers,
        body: JSON.stringify(finalizeBody),
      });

      if (!finalizeRes.ok) {
        const errText = await finalizeRes.text();
        throw new Error(`Failed to finalize video upload: ${errText.slice(0, 300)}`);
      }

      // Poll for AVAILABLE status (max 30 attempts, 2s apart — videos take longer)
      let videoStatus = "PROCESSING";
      for (let attempt = 0; attempt < 30; attempt++) {
        const statusRes = await fetch(
          `${LINKEDIN_API_BASE}/rest/videos/${encodeURIComponent(videoUrn)}`,
          { headers },
        );
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          videoStatus = statusData.status || "PROCESSING";
          if (videoStatus === "AVAILABLE") break;
          if (videoStatus === "PROCESSING_FAILED") {
            throw new Error("LinkedIn video processing failed");
          }
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const mediaObj: Record<string, unknown> = { id: videoUrn };
      if (post.article_title) mediaObj.title = post.article_title;

      content = { media: mediaObj };
    }

    // --- Document upload via /rest/documents ---
    if (hasDocument) {
      const docRes = await fetch(post.document_url);
      if (!docRes.ok) {
        throw new Error(`Failed to download document from ${post.document_url}`);
      }
      const docBuffer = new Uint8Array(await docRes.arrayBuffer());
      const fileSizeBytes = docBuffer.byteLength;

      const initBody = {
        initializeUploadRequest: {
          owner: personUrn,
          fileSizeBytes,
        },
      };

      const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/documents?action=initializeUpload`, {
        method: "POST",
        headers,
        body: JSON.stringify(initBody),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Failed to initialize document upload: ${errText.slice(0, 300)}`);
      }

      const initData = await initRes.json();
      const uploadUrl = initData.value?.uploadUrl;
      const documentUrn = initData.value?.document;

      if (!uploadUrl || !documentUrn) {
        throw new Error("LinkedIn did not return document upload URL or URN");
      }

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/pdf" },
        body: docBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload document to LinkedIn: ${errText.slice(0, 300)}`);
      }

      // Poll for AVAILABLE status (max 15 attempts, 2s apart)
      let docStatus = "PROCESSING";
      for (let attempt = 0; attempt < 15; attempt++) {
        const statusRes = await fetch(
          `${LINKEDIN_API_BASE}/rest/documents/${encodeURIComponent(documentUrn)}`,
          { headers },
        );
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          docStatus = statusData.status || "PROCESSING";
          if (docStatus === "AVAILABLE") break;
          if (docStatus === "PROCESSING_FAILED") {
            throw new Error("LinkedIn document processing failed");
          }
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const mediaObj: Record<string, unknown> = { id: documentUrn };
      if (post.article_title) mediaObj.title = post.article_title;

      content = { media: mediaObj };
    }

    // --- Article (link share) ---
    if (hasArticle && !hasImage && !hasVideo && !hasDocument) {
      const articleObj: Record<string, unknown> = {
        source: post.article_url,
      };
      if (post.article_title) articleObj.title = post.article_title;
      if (post.article_description) articleObj.description = post.article_description;
      // Thumbnail is optional and requires a pre-uploaded image URN
      // We skip it for now since we don't have a separate thumbnail upload flow

      content = { article: articleObj };
    }

    // --- Build the /rest/posts body ---
    const postBody: Record<string, unknown> = {
      author: personUrn,
      commentary: post.content_text || "",
      visibility: post.visibility || "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    if (content) {
      postBody.content = content;
    }

    const postRes = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify(postBody),
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

    // The post URN is in the x-restli-id response header
    const postUrn = postRes.headers.get("x-restli-id") || "";
    let permalink = "";

    // Try to get the permalink
    if (postUrn) {
      try {
        const permalinkRes = await fetch(
          `${LINKEDIN_API_BASE}/rest/posts/${encodeURIComponent(postUrn)}`,
          { headers },
        );
        if (permalinkRes.ok) {
          const permalinkData = await permalinkRes.json();
          if (permalinkData.permalink) {
            permalink = permalinkData.permalink;
          } else if (permalinkData.activityUrn) {
            const activityId = permalinkData.activityUrn.split(":").pop();
            if (activityId) {
              permalink = `https://www.linkedin.com/feed/update/${permalinkData.activityUrn}/`;
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
    const { post_id, action } = requestBody as { post_id?: string; action?: string };
    // Only mark as failed for publish action, not delete/edit
    if (post_id && !action) {
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
