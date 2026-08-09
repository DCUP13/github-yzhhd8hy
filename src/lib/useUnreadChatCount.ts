import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

export function useUnreadChatCount() {
  const [count, setCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let active = true;

    const fetchCount = async () => {
      const { data, error } = await supabase.rpc('get_unread_chat_count');
      if (!active || error) return;
      setCount(typeof data === 'number' ? data : 0);
    };

    fetchCount();

    channelRef.current = supabase
      .channel('unread_chat_count_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => fetchCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversations' }, () => fetchCount())
      .subscribe();

    return () => {
      active = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, []);

  return count;
}