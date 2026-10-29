import React from 'react';
import { CheckCircle2, Clock, Loader2, XCircle, PenLine, AlertTriangle, CircleDashed } from 'lucide-react';
import type { ScheduledPost } from './types';

export interface DisplayStatus {
  key: 'writing' | 'write_failed' | 'published' | 'partial' | 'publishing' | 'failed' | 'scheduled' | 'draft';
  label: string;
  className: string;
  dot: string;
  icon: React.ReactNode;
}

export function displayStatus(post: Pick<ScheduledPost, 'status' | 'generation_status'>): DisplayStatus {
  const i = 'w-3 h-3';
  if (post.status === 'published') return { key: 'published', label: 'Posted', dot: 'bg-green-500', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 className={i} /> };
  if (post.status === 'partial') return { key: 'partial', label: 'Partly posted', dot: 'bg-amber-500', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: <AlertTriangle className={i} /> };
  if (post.status === 'publishing') return { key: 'publishing', label: 'Publishing', dot: 'bg-yellow-400 animate-pulse', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: <Loader2 className={`${i} animate-spin`} /> };
  if (post.generation_status === 'pending' || post.generation_status === 'generating') {
    return { key: 'writing', label: 'Preparing', dot: 'bg-sky-400 animate-pulse', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', icon: <PenLine className={`${i} animate-pulse`} /> };
  }
  if (post.generation_status === 'failed') return { key: 'write_failed', label: 'Writing failed', dot: 'bg-red-500', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <AlertTriangle className={i} /> };
  if (post.status === 'failed') return { key: 'failed', label: 'Failed', dot: 'bg-red-500', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className={i} /> };
  if (post.status === 'scheduled') return { key: 'scheduled', label: 'Scheduled', dot: 'bg-pink-500', className: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300', icon: <Clock className={i} /> };
  return { key: 'draft', label: 'Draft', dot: 'bg-gray-400', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: <CircleDashed className={i} /> };
}

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.className}`}>
      {status.icon} {status.label}
    </span>
  );
}

export function isLocked(post: Pick<ScheduledPost, 'status' | 'generation_status'>): boolean {
  return post.status === 'published' || post.status === 'partial' || post.status === 'publishing' || post.generation_status === 'generating';
}
