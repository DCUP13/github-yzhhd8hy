import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';

interface ConversationRow {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_at: string | null;
  hidden_for_p1: boolean;
  hidden_for_p2: boolean;
  last_read_at_p1: string | null;
  last_read_at_p2: string | null;
  cleared_at_p1: string | null;
  cleared_at_p2: string | null;
}

function hasUnread(c: ConversationRow, userId: string): boolean {
  if (!c.last_message_at) return false;
  const isP1 = c.participant_1 === userId;
  const hidden = isP1 ? c.hidden_for_p1 : c.hidden_for_p2;
  if (hidden) return false;
  const lastRead = isP1 ? c.last_read_at_p1 : c.last_read_at_p2;
  const cleared = isP1 ? c.cleared_at_p1 : c.cleared_at_p2;
  const since = lastRead && cleared ? (lastRead > cleared ? lastRead : cleared) : (lastRead || cleared);
  // Only count messages from the other person (sender is not us)
  return since ? c.last_message_at > since : true;
}

export function useUnreadChatCount(activeView: string | null) {
  const [count, setCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const convsRef = useRef<ConversationRow[]>([]);
  const viewingChat = activeView === 'team';

  const recompute = useCallback(() => {
    if (!userId) return;
    const n = convsRef.current.filter(c => hasUnread(c, userId)).length;
    setCount(n);
  }, [userId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !active) return;
      const uid = session.user.id;
      setUserId(uid);

      const { data } = await supabase
        .from('team_conversations')
        .select('id, participant_1, participant_2, last_message_at, hidden_for_p1, hidden_for_p2, last_read_at_p1, last_read_at_p2, cleared_at_p1, cleared_at_p2')
        .or(`participant_1.eq.${uid},participant_2.eq.${uid}`);

      if (!active) return;
      convsRef.current = data ?? [];
      recompute();

      channelRef.current = supabase
        .channel('unread_chat_count_rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversations' }, (payload) => {
          const c = payload.new as ConversationRow;
          if (c.participant_1 !== uid && c.participant_2 !== uid) return;
          convsRef.current = [...convsRef.current.filter(x => x.id !== c.id), c];
          recompute();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'team_conversations' }, (payload) => {
          const old = payload.old as { id: string };
          convsRef.current = convsRef.current.filter(x => x.id !== old.id);
          recompute();
        })
        .subscribe();
    })();

    return () => {
      active = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, []);

  // When the user opens the chat page, clear the badge
  useEffect(() => {
    if (viewingChat && userId) {
      setCount(0);
      // Optimistically mark all current convs as read locally so recompute stays 0
      convsRef.current = convsRef.current.map(c => {
        if (c.participant_1 === userId) return { ...c, last_read_at_p1: c.last_message_at ?? c.last_read_at_p1 };
        return { ...c, last_read_at_p2: c.last_message_at ?? c.last_read_at_p2 };
      });
    }
  }, [viewingChat, userId]);

  // Recompute when leaving chat view (catch updates that happened while viewing)
  useEffect(() => {
    if (!viewingChat) recompute();
  }, [viewingChat, recompute]);

  return count;
}
