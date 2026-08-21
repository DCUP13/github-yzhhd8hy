/*
# Add jsonb overloads for sharing RPCs

## Problem
PostgREST sometimes fails to match RPC parameter names to function arguments and falls
back to passing the entire JSON body as a single jsonb argument. When the function
expects uuid params, this produces "cannot cast jsonb to uuid".

## Fix
Create jsonb-accepting overloads for the three frontend-called sharing functions.
These overloads extract the UUID values from the jsonb body and call the original
uuid-typed functions. PostgREST will match the jsonb overload in its fallback path.

## Important
The original uuid-typed functions remain as the canonical implementation.
The jsonb overloads are thin wrappers that just extract and delegate.
*/

-- jsonb overload for apply_settings_group_to_account
CREATE OR REPLACE FUNCTION public.apply_settings_group_to_account(p_body jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.apply_settings_group_to_account(
    (p_body->>'p_group_id')::uuid,
    (p_body->>'p_account_id')::uuid
  );
END;
$$;

-- jsonb overload for unsubscribe_account_from_group
CREATE OR REPLACE FUNCTION public.unsubscribe_account_from_group(p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.unsubscribe_account_from_group(
    (p_body->>'p_group_id')::uuid,
    (p_body->>'p_account_id')::uuid
  );
END;
$$;

-- jsonb overload for resubscribe_account_to_group
CREATE OR REPLACE FUNCTION public.resubscribe_account_to_group(p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.resubscribe_account_to_group(
    (p_body->>'p_group_id')::uuid,
    (p_body->>'p_account_id')::uuid
  );
END;
$$;

-- Grant execute on jsonb overloads
GRANT EXECUTE ON FUNCTION public.apply_settings_group_to_account(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_account_from_group(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubscribe_account_to_group(jsonb) TO authenticated;
