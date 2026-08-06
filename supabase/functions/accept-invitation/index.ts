import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { organization_id, role, invitation_id, email, password } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: 'Missing organization_id' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (email && password) {
      const { data: invitation } = await supabase
        .from('member_invitations')
        .select('*')
        .eq('email', email)
        .eq('temporary_password', password)
        .eq('organization_id', organization_id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!invitation) {
        return new Response(
          JSON.stringify({ error: 'No valid invitation found' }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === email);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;

        await supabase.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: {
            needs_password_change: true
          }
        });
      } else {
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            needs_password_change: true
          }
        });

        if (createError) {
          console.error('Error creating user:', createError);
          return new Response(
            JSON.stringify({ error: createError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        userId = newUser.user.id;
      }

      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id,
          user_id: userId,
          role: invitation.role || role || 'member',
        });

      if (memberError) {
        console.error('Error adding member:', memberError);
        return new Response(
          JSON.stringify({ error: 'Failed to add member to organization' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (invitation_id) {
        await supabase
          .from('member_invitations')
          .update({ status: 'accepted' })
          .eq('id', invitation_id);
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (sessionError || !sessionData.session) {
        return new Response(
          JSON.stringify({ error: 'Failed to create session' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          session: sessionData.session
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Email and password required for new users' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
