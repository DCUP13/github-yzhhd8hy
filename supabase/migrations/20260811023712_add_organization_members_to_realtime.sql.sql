/*
# Add organization_members to realtime publication

## Purpose
Enables realtime updates on the organization_members table so that when a
member's role changes (e.g. manager → member), the user's app updates
live without a page reload.

## Changes
- Adds `public.organization_members` to the `supabase_realtime` publication.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members;
