-- Add team chat tables to the realtime publication so messages propagate live
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;