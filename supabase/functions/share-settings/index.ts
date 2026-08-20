import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

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
    const { action, p_group_id, p_account_id, p_owner_user_id, p_source_account_id, p_user_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let result: { data: unknown; error: string | null } = { data: null, error: null };

    if (action === "apply") {
      const { data, error } = await supabase.rpc("apply_settings_group_to_account", {
        p_group_id,
        p_account_id,
      });
      result = { data, error: error?.message ?? null };
    } else if (action === "unsubscribe") {
      const { error } = await supabase.rpc("unsubscribe_account_from_group", {
        p_group_id,
        p_account_id,
      });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "resubscribe") {
      const { error } = await supabase.rpc("resubscribe_account_to_group", {
        p_group_id,
        p_account_id,
      });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "share_all") {
      const { error } = await supabase.rpc("share_all_settings_to_account", {
        p_account_id,
        p_owner_user_id,
      });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "share_all_from_to") {
      const { error } = await supabase.rpc("share_all_settings_from_to", {
        p_source_account_id,
        p_target_account_id: p_account_id,
        p_user_id,
      });
      result = { data: null, error: error?.message ?? null };
    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data: result.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
