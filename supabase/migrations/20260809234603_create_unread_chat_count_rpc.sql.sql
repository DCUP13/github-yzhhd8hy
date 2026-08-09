CREATE OR REPLACE FUNCTION public.get_unread_chat_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM team_messages m
  JOIN team_conversations c ON c.id = m.conversation_id
  WHERE (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    AND m.sender_id != auth.uid()
    AND m.created_at > COALESCE(
        CASE WHEN c.participant_1 = auth.uid() THEN c.last_read_at_p1 ELSE c.last_read_at_p2 END,
        c.created_at
      )
    AND m.created_at > COALESCE(
        CASE WHEN c.participant_1 = auth.uid() THEN c.cleared_at_p1 ELSE c.cleared_at_p2 END,
        '2000-01-01'::timestamptz
      )
    AND NOT (CASE WHEN c.participant_1 = auth.uid() THEN c.hidden_for_p1 ELSE c.hidden_for_p2 END)
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_chat_count() TO authenticated;
