/*
# Fix shared Instagram RLS policies — multi-row subquery error

## Problem
Three RLS policies used a scalar subquery to pass an account ID to the
`has_ig_share()` function:

  has_ig_share((SELECT instagram_accounts.id FROM instagram_accounts
                WHERE instagram_accounts.user_id = <table>.user_id))

When a user has multiple Instagram accounts, this subquery returns multiple
rows, causing: "more than one row returned by a subquery used as an expression"
( PostgreSQL error 21000 ). This resulted in HTTP 500 on every query to
instagram_webhook_events, instagram_auto_rules, and instagram_posts — making
the Instagram inbox appear empty.

## Fix
Replace the scalar-subquery pattern with an EXISTS check that joins
instagram_account_shares to instagram_accounts directly. This correctly
handles users with multiple accounts.

## Affected tables
- instagram_webhook_events  (SELECT policy "select_shared_ig_webhook_events")
- instagram_auto_rules      (SELECT policy "select_shared_ig_auto_rules")
- instagram_posts           (SELECT policy "select_shared_ig_posts")

## Security
- No new tables or columns.
- Policies remain owner-scoped (auth.uid() = user_id) for the primary SELECT.
- Shared access is still checked via instagram_account_shares.
- No changes to INSERT/UPDATE/DELETE policies.
*/

-- Fix instagram_webhook_events
DROP POLICY IF EXISTS "select_shared_ig_webhook_events" ON instagram_webhook_events;
CREATE POLICY "select_shared_ig_webhook_events" ON instagram_webhook_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM instagram_account_shares s
      JOIN instagram_accounts a ON a.id = s.account_id
      WHERE a.user_id = instagram_webhook_events.user_id
        AND s.shared_with_user_id = auth.uid()
    )
  );

-- Fix instagram_auto_rules
DROP POLICY IF EXISTS "select_shared_ig_auto_rules" ON instagram_auto_rules;
CREATE POLICY "select_shared_ig_auto_rules" ON instagram_auto_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM instagram_account_shares s
      JOIN instagram_accounts a ON a.id = s.account_id
      WHERE a.user_id = instagram_auto_rules.user_id
        AND s.shared_with_user_id = auth.uid()
    )
  );

-- Fix instagram_posts
DROP POLICY IF EXISTS "select_shared_ig_posts" ON instagram_posts;
CREATE POLICY "select_shared_ig_posts" ON instagram_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM instagram_account_shares s
      JOIN instagram_accounts a ON a.id = s.account_id
      WHERE a.user_id = instagram_posts.user_id
        AND s.shared_with_user_id = auth.uid()
    )
  );
