/*
  # Create Shared Items Table for Campaign, Contact, and Template Sharing

  ## Overview
  Allows the platform owner (super_admin) and users to share campaigns, contacts,
  and templates with everyone or with specific organizations. Recipients can view
  shared items and copy them into their own account.

  ## New Table: `shared_items`
  - `id` (uuid, primary key)
  - `item_type` (text, not null) — 'campaign' | 'contact' | 'template'
  - `item_id` (uuid, not null) — the ID of the shared item in its source table
  - `shared_by` (uuid, references profiles) — who shared the item
  - `shared_with_type` (text, not null) — 'all' | 'organization'
  - `shared_with_org_id` (uuid, nullable, references organizations) — target org
  - `created_at` (timestamptz)

  ## Security (RLS)
  - Super_admin can do everything
  - Any authenticated user can SELECT shared items shared with 'all' or their org
  - Users can INSERT shares for their own items
  - Users can DELETE shares they created

  ## Important Notes
  1. Sharing creates a reference, not a copy. Recipients use "Add to my account" to copy.
  2. Super_admin can share any item. Users can share their own items.
  3. Unsharing removes the reference; copies already made remain.
*/

CREATE TABLE IF NOT EXISTS shared_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('campaign', 'contact', 'template')),
  item_id uuid NOT NULL,
  shared_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  shared_with_type text NOT NULL CHECK (shared_with_type IN ('all', 'organization')),
  shared_with_org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CHECK (
    (shared_with_type = 'all' AND shared_with_org_id IS NULL) OR
    (shared_with_type = 'organization' AND shared_with_org_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_shared_items_type_id ON shared_items(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_shared_items_org ON shared_items(shared_with_org_id);

ALTER TABLE shared_items ENABLE ROW LEVEL SECURITY;

-- Super admin can do everything
DROP POLICY IF EXISTS "super_admin_all_shared_items" ON shared_items;
CREATE POLICY "super_admin_all_shared_items"
  ON shared_items FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Users can see items shared with everyone or their own org
DROP POLICY IF EXISTS "users_select_visible_shared_items" ON shared_items;
CREATE POLICY "users_select_visible_shared_items"
  ON shared_items FOR SELECT
  TO authenticated
  USING (
    shared_with_type = 'all'
    OR shared_with_org_id = public.get_user_org_id()
  );

-- Users can share their own items
DROP POLICY IF EXISTS "users_insert_own_shared_items" ON shared_items;
CREATE POLICY "users_insert_own_shared_items"
  ON shared_items FOR INSERT
  TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND (
      shared_with_type = 'all'
      OR shared_with_org_id = public.get_user_org_id()
    )
  );

-- Users can delete items they shared
DROP POLICY IF EXISTS "users_delete_own_shared_items" ON shared_items;
CREATE POLICY "users_delete_own_shared_items"
  ON shared_items FOR DELETE
  TO authenticated
  USING (shared_by = auth.uid());