/*
# Editable prompt copies on Instagram post slots

Works like LinkedIn: when a prompt is picked in a post slot, its text is copied
into the slot so it can be edited there without changing the original prompt
on the Prompts page.

1. Modified Tables
- `instagram_plan_slots`
  - `caption_prompt` (text, default '') - the slot's own copy of the caption prompt
  - `overlay_prompt` (text, default '') - the slot's own copy of the photo-text prompt
    (empty means the built-in photo-text instructions are used)
  - Existing `prompt_id` / `overlay_prompt_id` stay as a record of where the copy came from.

2. Data
- Existing slots are backfilled with the current text of their linked prompts,
  so they keep writing exactly as before.

3. Security
- No policy changes; existing owner-scoped RLS on the table applies to the new columns.
*/

ALTER TABLE instagram_plan_slots ADD COLUMN IF NOT EXISTS caption_prompt text NOT NULL DEFAULT '';
ALTER TABLE instagram_plan_slots ADD COLUMN IF NOT EXISTS overlay_prompt text NOT NULL DEFAULT '';

UPDATE instagram_plan_slots s
SET caption_prompt = p.content
FROM prompts p
WHERE s.prompt_id = p.id AND s.caption_prompt = '' AND coalesce(p.content, '') <> '';

UPDATE instagram_plan_slots s
SET overlay_prompt = p.content
FROM prompts p
WHERE s.overlay_prompt_id = p.id AND s.overlay_prompt = '' AND coalesce(p.content, '') <> '';