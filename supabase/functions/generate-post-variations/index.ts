import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import OpenAI from "npm:openai@4.28.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FONTS = ['Inter', 'Georgia', 'Courier', 'Impact', 'Palatino', 'Arial', 'Verdana', 'Trebuchet'];

function fillPlaceholders(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  result = result.replace(/\{\{\w+\}\}/g, '');
  return result;
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 1000,
  });
  const raw = completion.choices[0]?.message?.content ?? '';
  return raw.replace(/^```[a-zA-Z]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
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
    const { batch_id } = body as { batch_id?: string };

    if (!batch_id) {
      return new Response(JSON.stringify({ error: "Missing batch_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the batch
    const { data: batch, error: batchError } = await supabase
      .from("instagram_post_batches")
      .select("*")
      .eq("id", batch_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (batchError || !batch) {
      return new Response(JSON.stringify({ error: "Batch not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update batch status to generating
    await supabase
      .from("instagram_post_batches")
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq("id", batch_id);

    // Load the selected library assets
    const assetIds = batch.selected_asset_ids || [];
    const { data: assets } = await supabase
      .from("media_assets")
      .select("*")
      .in("id", assetIds)
      .eq("user_id", user.id);

    if (!assets || assets.length === 0) {
      return new Response(JSON.stringify({ error: "No library assets selected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all Instagram accounts for this user
    const { data: accounts } = await supabase
      .from("instagram_accounts")
      .select("id, username, profile_picture_url, user_id")
      .eq("user_id", user.id);

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ error: "No Instagram accounts connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load the prompt for AI caption variation (if specified)
    let promptContent: string | null = null;
    if (batch.prompt_id) {
      const { data: promptRow } = await supabase
        .from("prompts")
        .select("content")
        .eq("id", batch.prompt_id)
        .eq("user_id", user.id)
        .maybeSingle();
      promptContent = promptRow?.content || null;
    }

    const settings = batch.variation_settings || {};
    const useAICaption = settings.caption !== false;
    const shuffleHashtags = settings.hashtags !== false;
    const varyFont = settings.font !== false;

    // Delete any existing variations for this batch
    await supabase
      .from("instagram_post_variations")
      .delete()
      .eq("batch_id", batch_id);

    // Generate variations for each account
    const variations: Array<Record<string, unknown>> = [];
    const previewCount = Math.min(batch.preview_count || accounts.length, accounts.length);
    const targetAccounts = accounts.slice(0, previewCount);

    for (let i = 0; i < targetAccounts.length; i++) {
      const account = targetAccounts[i];

      // Select asset: randomize if enabled, otherwise use sequential
      let asset;
      if (batch.randomize_content) {
        asset = assets[Math.floor(Math.random() * assets.length)];
      } else {
        asset = assets[i % assets.length];
      }

      // Generate caption variation
      let caption = batch.base_caption || '';
      if (useAICaption && promptContent && batch.base_caption) {
        try {
          const captionVars: Record<string, string> = {
            original_caption: batch.base_caption,
            account_name: account.username || '',
            hashtags: (batch.hashtags || []).join(' '),
            variation_style: 'lightly rephrased, same meaning, different wording',
            transcript: asset.transcript || '',
          };
          const filled = fillPlaceholders(promptContent, captionVars);
          caption = await callAI(
            "You are an AI assistant generating a unique Instagram caption variation. Keep it natural, engaging, and professional. Do not include hashtags in the caption — they are handled separately.",
            filled,
          );
        } catch (e) {
          console.error("AI caption generation failed, using original:", e);
          caption = batch.base_caption;
        }
      }

      // Shuffle hashtags
      let hashtags = batch.hashtags || [];
      if (shuffleHashtags && hashtags.length > 1) {
        hashtags = shuffleArray(hashtags);
      }

      // Select font
      const fontUsed = varyFont ? FONTS[Math.floor(Math.random() * FONTS.length)] : null;

      // Call overlay-text-on-image edge function to create the edited content
      let cloudfrontUrl = asset.cloudfront_url;
      let s3Key = asset.s3_key;

      try {
        const overlayResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/overlay-text-on-image`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.get("Authorization") || '',
            },
            body: JSON.stringify({
              source_url: asset.cloudfront_url,
              text: caption.slice(0, 200),
              font_name: fontUsed,
              target_folder: batch.content_type === 'reel' ? 'reels' : 'posts',
              content_type: asset.mime_type || 'image/jpeg',
            }),
          },
        );

        if (overlayResponse.ok) {
          const overlayResult = await overlayResponse.json();
          cloudfrontUrl = overlayResult.cloudfront_url || cloudfrontUrl;
          s3Key = overlayResult.s3_key || s3Key;
        }
      } catch (e) {
        console.error("Overlay generation failed, using original:", e);
      }

      variations.push({
        batch_id: batch_id,
        user_id: user.id,
        account_id: account.id,
        cloudfront_url: cloudfrontUrl,
        s3_key: s3Key,
        caption: caption,
        hashtags: hashtags,
        font_used: fontUsed,
        status: 'staged',
      });
    }

    // Insert all variations
    if (variations.length > 0) {
      const { error: insertError } = await supabase
        .from("instagram_post_variations")
        .insert(variations);

      if (insertError) throw insertError;
    }

    // Update batch status to ready
    await supabase
      .from("instagram_post_batches")
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq("id", batch_id);

    return new Response(JSON.stringify({
      success: true,
      variations_created: variations.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-post-variations error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
