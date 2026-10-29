import { supabase } from '../../lib/supabase';
import type { ScheduledPost } from './types';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export async function generateWithEngine(postId: string, parts: 'all' | 'caption' | 'media', instructions = ''): Promise<ScheduledPost> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again');
  const res = await fetch(`${FUNCTIONS_URL}/instagram-content-engine`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', post_id: postId, parts, instructions }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.post) throw new Error(body?.error || 'Generation failed');
  return body.post as ScheduledPost;
}

function ping(fn: string) {
  fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => undefined);
}

export const nudgeEngine = () => ping('instagram-content-engine');
export const nudgePublisher = () => ping('process-instagram-engine-queue');
