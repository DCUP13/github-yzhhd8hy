import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_USERS_PER_RUN = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: settings, error } = await supabase
      .from("instagram_refresh_settings")
      .select("user_id, refresh_interval_hours, last_refresh_at")
      .eq("auto_refresh_enabled", true)
      .order("last_refresh_at", { ascending: true, nullsFirst: true });

    if (error) {
      console.error("Error loading refresh settings:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    const due = (settings ?? [])
      .filter((s) => {
        if (!s.last_refresh_at) return true;
        const hours = s.refresh_interval_hours > 0 ? s.refresh_interval_hours : 6;
        return now - new Date(s.last_refresh_at).getTime() >= hours * 3600_000;
      })
      .slice(0, MAX_USERS_PER_RUN);

    if (due.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claim the slot up front so an overlapping run (syncs can take over a minute) skips these users.
    const nowIso = new Date().toISOString();
    await supabase
      .from("instagram_refresh_settings")
      .update({ last_refresh_at: nowIso, updated_at: nowIso })
      .in("user_id", due.map((s) => s.user_id));

    const { data: accounts, error: acctError } = await supabase
      .from("instagram_accounts")
      .select("id, user_id")
      .in("user_id", due.map((s) => s.user_id))
      .eq("connected", true)
      .not("access_token", "is", null);

    if (acctError) {
      console.error("Error loading Instagram accounts:", acctError);
      return new Response(JSON.stringify({ error: acctError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.allSettled((accounts ?? []).map(async (acct) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/instagram-sync-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ account_id: acct.id, user_id: acct.user_id }),
      });
      if (!res.ok) throw new Error(`Account ${acct.id}: ${res.status} ${await res.text()}`);
    }));

    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((r) => console.error("Auto-refresh sync failed:", (r as PromiseRejectedResult).reason));

    return new Response(JSON.stringify({
      users: due.length,
      accounts: results.length,
      synced: results.length - failed.length,
      failed: failed.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("instagram-auto-refresh error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
