/*
# Prompts: Two-Step Reply Mode, Business Data, and Conversation Placeholders

1. Purpose
   Upgrades the prompts table to support a one-step or two-step AI reply chain.
   In two-step mode, Step 1 runs first and its full output is inserted verbatim
   into Step 2 at the {{step1_result}} placeholder before Step 2 runs. Also adds
   a Business Data section and built-in placeholders for the incoming email and
   full conversation history.

2. Changes to existing table: prompts
   New columns (all nullable / defaulted so existing rows are unaffected):

   - reply_mode (text, default 'single')
       'single' = one-step reply; 'two_step' = chained Step 1 then Step 2.
   - step1_content (text)
       The Step 1 prompt text (output format + instructions).
   - step2_content (text)
       The Step 2 prompt text. May contain {{step1_result}} placeholder.
   - business_data (text)
       Free-form business/offer details. Referenced via {{business_data}}.
   - use_business_data (boolean, default false)
       Whether this prompt should inject business data into the AI call.

   The existing `content` column is kept for backward compatibility and serves
   as the single-step prompt body when reply_mode = 'single'.

3. Built-in placeholders (documented, not stored as columns):
   - {{step1_result}}  — Step 1's full output, inserted into Step 2.
   - {{business_data}} — The business_data text, usable in either step.
   - {{email}}         — The incoming email content.
   - {{conversation}}  — The full conversation/thread history.

4. Security
   - No new tables; prompts table already has RLS enabled.
   - No policy changes needed — existing owner-scoped CRUD still applies.

5. Notes
   - All new columns are nullable with safe defaults so existing prompts and
     the current single-step autoresponder behavior continue to work unchanged.
*/

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS reply_mode text NOT NULL DEFAULT 'single';

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS step1_content text;

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS step2_content text;

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS business_data text;

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS use_business_data boolean NOT NULL DEFAULT false;
