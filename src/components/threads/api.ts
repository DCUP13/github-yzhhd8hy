import { supabase } from '../../lib/supabase';
import type { ScheduledPost } from './types';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function call(fn: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again');
  const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok && res.status !== 207, json };
}

export async function generateWithEngine(postId: string, parts: 'all' | 'text' | 'photos', instructions = ''): Promise<ScheduledPost> {
  const { ok, json } = await call('threads-content-engine', { action: 'generate', post_id: postId, parts, instructions });
  if (!ok || !json?.post) throw new Error(json?.error || 'Writing failed');
  return json.post as ScheduledPost;
}

export async function startThreadsConnect(): Promise<string> {
  const { ok, json } = await call('threads-oauth-start', { app_origin: window.location.origin });
  if (!ok || typeof json?.auth_url !== 'string') throw new Error(json?.error || 'Could not start the Threads connection');
  return json.auth_url;
}

export async function syncInsights(): Promise<number> {
  const { ok, json } = await call('threads-actions', { action: 'sync_insights' });
  if (!ok) throw new Error(json?.error || 'Could not refresh stats');
  return Number(json?.updated) || 0;
}

export async function deleteFromThreads(postId: string): Promise<ScheduledPost | null> {
  const { ok, json } = await call('threads-actions', { action: 'delete_post', post_id: postId });
  if (!ok) throw new Error(json?.error || 'Could not remove the post from Threads');
  return (json?.post as ScheduledPost) || null;
}

function ping(fn: string) {
  fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => undefined);
}

export const nudgeEngine = () => ping('threads-content-engine');
export const nudgePublisher = () => ping('process-threads-queue');
