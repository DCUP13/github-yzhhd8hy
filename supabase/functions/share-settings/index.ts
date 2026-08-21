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
    const { action, p_group_id, p_account_id, p_owner_user_id, p_source_account_id, p_user_id, p_flow_id, p_rule_id, p_settings_id } = await req.json();

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
    } else if (action === "sync_flow") {
      const { error } = await supabase.rpc("sync_flow_to_group", { p_flow_id });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "sync_rule") {
      const { error } = await supabase.rpc("sync_rule_to_group", { p_rule_id });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "sync_autoresponder") {
      const { error } = await supabase.rpc("sync_autoresponder_to_group", { p_settings_id });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "sync_account") {
      const { error } = await supabase.rpc("sync_account_settings", {
        p_source_account_id,
        p_target_account_id: p_account_id,
        p_user_id,
      });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "unsync_account") {
      const { error } = await supabase.rpc("unsync_account_settings", { p_account_id });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "resync_account") {
      const { error } = await supabase.rpc("resync_account_settings", {
        p_source_account_id,
        p_target_account_id: p_account_id,
        p_user_id,
      });
      result = { data: null, error: error?.message ?? null };
    } else if (action === "delete_flow") {
      // Delete a flow AND all synced copies across other accounts.
      // Uses service role to bypass RLS — synced copies may have different user_id.
      const flowId = p_flow_id as string;

      // Get the settings_group_id so we can find all copies
      const { data: flowRow } = await supabase
        .from("instagram_conversation_flows")
        .select("settings_group_id")
        .eq("id", flowId)
        .maybeSingle();

      const groupId = (flowRow as { settings_group_id: string | null } | null)?.settings_group_id;

      if (groupId) {
        // Find all flows in the group and delete them all (steps/sessions cascade)
        const { data: groupFlows } = await supabase
          .from("instagram_conversation_flows")
          .select("id")
          .eq("settings_group_id", groupId);
        const allIds = (groupFlows as { id: string }[] | null)?.map((f) => f.id) ?? [];
        if (allIds.length > 0) {
          const { error: delErr } = await supabase
            .from("instagram_conversation_flows")
            .delete()
            .in("id", allIds);
          if (delErr) {
            result = { data: null, error: delErr.message };
          } else {
            // Clean up the group and subscriptions
            await supabase.from("instagram_settings_subscriptions").delete().eq("group_id", groupId);
            await supabase.from("instagram_settings_groups").delete().eq("id", groupId);
            result = { data: { deleted: allIds.length }, error: null };
          }
        } else {
          result = { data: { deleted: 0 }, error: null };
        }
      } else {
        // No group — just delete this one flow
        const { error: delErr } = await supabase
          .from("instagram_conversation_flows")
          .delete()
          .eq("id", flowId);
        result = { data: null, error: delErr?.message ?? null };
      }
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
