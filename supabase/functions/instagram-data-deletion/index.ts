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
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    console.log("Instagram data deletion callback received:", JSON.stringify(body));

    // Meta requires this endpoint to return a confirmation URL and status code.
    // We acknowledge the request — no user data is stored beyond the access token
    // and basic profile info, which the user can delete by disconnecting the account.
    return new Response(JSON.stringify({
      url: `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/instagram-deauthorize`,
      confirmation_code: Date.now().toString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Data deletion callback error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
