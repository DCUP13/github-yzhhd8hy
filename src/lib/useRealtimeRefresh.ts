import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

const DEBOUNCE_MS = 300;

export function useRealtimeRefresh(channelName: string, tables: string[], onChange: (table: string) => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const key = tables.join(',');

  useEffect(() => {
    const timers = new Map<string, number>();
    let channel = supabase.channel(`${channelName}_${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        window.clearTimeout(timers.get(table));
        timers.set(table, window.setTimeout(() => onChangeRef.current(table), DEBOUNCE_MS));
      });
    }
    channel.subscribe();
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      supabase.removeChannel(channel);
    };
  }, [channelName, key]);
}
