CREATE OR REPLACE FUNCTION public.trigger_email_sending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  request_id bigint;
  supabase_url text;
  supabase_anon_key text;
  request_headers text;
BEGIN
  IF NEW.status = 'pending' THEN
    supabase_url := current_setting('app.settings.supabase_url', true);
    supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);

    -- Fallback: derive URL from request headers if the app setting is missing
    IF supabase_url IS NULL THEN
      BEGIN
        request_headers := current_setting('request.headers', true);
        IF request_headers IS NOT NULL THEN
          supabase_url := 'https://' || (request_headers::json)->>'host';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        supabase_url := NULL;
      END;
    END IF;

    IF supabase_url IS NOT NULL AND supabase_anon_key IS NOT NULL THEN
      BEGIN
        SELECT INTO request_id net.http_post(
          url := supabase_url || '/functions/v1/send-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || supabase_anon_key
          ),
          body := jsonb_build_object(
            'email_id', NEW.id::text,
            'user_id', NEW.user_id::text
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to trigger email sending for %: %', NEW.id, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Cannot trigger email sending for %: missing supabase_url or anon_key', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
