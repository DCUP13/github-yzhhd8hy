/*
# Drop jsonb overloads causing PostgREST ambiguity

The jsonb overloads created ambiguity in PostgREST's overload resolution,
causing "cannot cast jsonb to uuid" errors. The sharing logic will be moved
to an Edge Function that calls the uuid-typed functions directly, bypassing
PostgREST's parameter matching entirely.
*/

DROP FUNCTION IF EXISTS public.apply_settings_group_to_account(jsonb);
DROP FUNCTION IF EXISTS public.unsubscribe_account_from_group(jsonb);
DROP FUNCTION IF EXISTS public.resubscribe_account_to_group(jsonb);
