/*
# Add per-post writing prompt to Threads posts

1. Modified Tables
- `threads_posts`
  - `thread_prompt` (text, nullable): the editable writing prompt used by AI to draft this specific post.
    Filled when a saved Threads prompt is imported, or copied from the plan slot. When empty, the
    writer falls back to the slot prompt, then the linked saved prompt, then a default.

2. Security
- No policy changes; existing owner-scoped policies on `threads_posts` already cover the new column.
*/

ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS thread_prompt text;