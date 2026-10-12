import { supabase } from '../../lib/supabase';
import type { EnginePost } from './types';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function accessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again');
  return session.access_token;
}

export async function uploadFile(file: File, folder: string): Promise<{ url: string; name: string }> {
  const token = await accessToken();
  const form = new FormData();
  form.append('file', file);
  form.append('file_name', file.name);
  form.append('content_type', file.type || 'application/octet-stream');
  form.append('folder', folder);

  const res = await fetch(`${FUNCTIONS_URL}/generate-s3-upload-url`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.cloudfront_url) {
    throw new Error(body?.error || 'Upload failed');
  }
  return { url: body.cloudfront_url as string, name: (body.file_name as string) || file.name };
}

export async function generateWithEngine(postId: string, parts: 'all' | 'post' | 'guide'): Promise<EnginePost> {
  const token = await accessToken();
  const res = await fetch(`${FUNCTIONS_URL}/linkedin-content-engine`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', post_id: postId, parts }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.post) throw new Error(body?.error || 'Generation failed');
  return body.post as EnginePost;
}

export function nudgeEngine() {
  fetch(`${FUNCTIONS_URL}/linkedin-content-engine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => undefined);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function mondayOf(s: string): string {
  const d = parseISODate(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}

export function formatDay(s: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return parseISODate(s).toLocaleDateString('en-US', opts);
}

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
