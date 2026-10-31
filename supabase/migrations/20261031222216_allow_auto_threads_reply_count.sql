/*
# Allow "Auto" follow-up reply count for Threads

1. Modified Tables
- `threads_posts.reply_count`: range check widened from 0..10 to -1..10.
- `threads_plan_slots.reply_count`: range check widened from 0..10 to -1..10.

2. Meaning
- -1 = Auto: the AI decides how many follow-up replies the content needs (up to 10).
- 0 = single post, 1..10 = that many follow-up replies.

3. Security
- No RLS, policy or grant changes. No data is changed.
*/

ALTER TABLE threads_posts DROP CONSTRAINT IF EXISTS threads_posts_reply_count_range;
ALTER TABLE threads_posts ADD CONSTRAINT threads_posts_reply_count_range CHECK (reply_count >= -1 AND reply_count <= 10);

ALTER TABLE threads_plan_slots DROP CONSTRAINT IF EXISTS threads_plan_slots_reply_count_range;
ALTER TABLE threads_plan_slots ADD CONSTRAINT threads_plan_slots_reply_count_range CHECK (reply_count >= -1 AND reply_count <= 10);
