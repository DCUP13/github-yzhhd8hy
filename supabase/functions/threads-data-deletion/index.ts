import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function parseSignedRequest(signed: string, secret: string): Promise<{ user_id?: string } | null> {
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), new TextEncoder().encode(payload));
  if (!ok) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (data.algorithm && String(data.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return data;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/threads-data-deletion`;

    if (req.method === "GET") {
      const code = (new URL(req.url).searchParams.get("code") ?? "").slice(0, 64);
      const body = code
        ? `<h1>Data deletion request</h1><p>Request <strong>${escapeHtml(code)}</strong> has been completed. Your Threads connection details have been removed.</p>`
        : `<h1>Data deletion</h1><p>To remove your Threads data, remove this app from your Threads settings under Website permissions, or disconnect your profile inside the app.</p>`;
      return new Response(`<!doctype html><html><body style="font-family:sans-serif;max-width:560px;margin:48px auto;line-height:1.5">${body}</body></html>`, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const secret = Deno.env.get("THREADS_APP_SECRET");
    if (!secret) return json({ error: "Not configured" }, 500);

    const form = await req.formData().catch(() => null);
    const signed = form?.get("signed_request");
    if (typeof signed !== "string") return json({ error: "Missing signed_request" }, 400);

    const data = await parseSignedRequest(signed, secret);
    if (!data?.user_id) return json({ error: "Invalid signature" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { error } = await supabase.from("threads_accounts").delete().eq("threads_user_id", String(data.user_id));
    if (error) {
      console.error("threads-data-deletion failed", error);
      return json({ error: "Could not process request" }, 500);
    }

    const confirmation = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    return json({ url: `${selfUrl}?code=${confirmation}`, confirmation_code: confirmation });
  } catch (error) {
    console.error("threads-data-deletion error:", error);
    return json({ error: "Could not process request" }, 500);
  }
});
