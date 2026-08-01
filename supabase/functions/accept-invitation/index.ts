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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const url = new URL(req.url);
    const token = url.searchParams.get("token") || (() => {
      try {
        return (req as any).json?.()?.token;
      } catch {
        return null;
      }
    })();

    let inviteToken = token;

    if (!inviteToken && req.method === "POST") {
      try {
        const body = await req.json();
        inviteToken = body.token;
      } catch {
        // ignore parse error
      }
    }

    if (!inviteToken) {
      return new Response(
        JSON.stringify({ error: "Missing invitation token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .select(`
        *,
        organizations ( id, name )
      `)
      .eq("token", inviteToken)
      .maybeSingle();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invalid invitation token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invitation.status === "accepted") {
      return new Response(
        JSON.stringify({
          valid: false,
          message: "This invitation has already been accepted. Please sign in with your email and password.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invitation.status === "revoked") {
      return new Response(
        JSON.stringify({ valid: false, message: "This invitation has been revoked." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ valid: false, message: "This invitation has expired." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        organization_name: invitation.organizations?.name || "Unknown",
        role: invitation.role,
        email: invitation.email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in accept-invitation:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
