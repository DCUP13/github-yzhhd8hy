import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import OpenAI from "npm:openai@4.28.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    const { asset_id } = body as { asset_id?: string };

    if (!asset_id) {
      return new Response(JSON.stringify({ error: "Missing asset_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the media asset
    const { data: asset, error: assetError } = await supabase
      .from("media_assets")
      .select("*")
      .eq("id", asset_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (assetError || !asset) {
      return new Response(JSON.stringify({ error: "Media asset not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (asset.file_type !== 'video') {
      return new Response(JSON.stringify({ error: "Asset is not a video" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (asset.transcript) {
      return new Response(JSON.stringify({ transcript: asset.transcript, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the video from CloudFront
    const videoResponse = await fetch(asset.cloudfront_url);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBlob = await videoResponse.blob();
    const videoFile = new File([videoBlob], asset.file_name, { type: asset.mime_type || 'video/mp4' });

    // Call OpenAI Whisper API
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const transcription = await openai.audio.transcriptions.create({
      file: videoFile,
      model: 'whisper-1',
    });

    const transcriptText = transcription.text || '';

    // Save transcript to the media asset
    await supabase
      .from("media_assets")
      .update({ transcript: transcriptText })
      .eq("id", asset_id);

    return new Response(JSON.stringify({ transcript: transcriptText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("transcribe-video error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
