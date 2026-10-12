import React from 'react';
import { CheckCircle2, Clock, Loader2, XCircle, Eye, Hourglass, PenLine, AlertTriangle } from 'lucide-react';
import type { EnginePost } from './types';

export interface DisplayStatus {
  key: 'writing' | 'waiting' | 'write_failed' | 'published' | 'publishing' | 'failed' | 'needs_review' | 'scheduled' | 'draft';
  label: string;
  className: string;
  icon: React.ReactNode;
}

export function displayStatus(post: Pick<EnginePost, 'status' | 'generation_status' | 'needs_review' | 'category' | 'scheduled_for'>, leadDays: number): DisplayStatus {
  const i = 'w-3 h-3';
  if (post.status === 'published') return { key: 'published', label: 'Posted', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 className={i} /> };
  if (post.status === 'publishing') return { key: 'publishing', label: 'Publishing', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: <Loader2 className={`${i} animate-spin`} /> };
  if (post.generation_status === 'pending' || post.generation_status === 'generating') {
    const waiting = post.generation_status === 'pending' && post.category === 'research' && post.scheduled_for &&
      new Date(post.scheduled_for).getTime() > Date.now() + leadDays * 86400000;
    return waiting
      ? { key: 'waiting', label: 'Research pending', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: <Hourglass className={i} /> }
      : { key: 'writing', label: 'Writing', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', icon: <PenLine className={`${i} animate-pulse`} /> };
  }
  if (post.generation_status === 'failed') return { key: 'write_failed', label: 'Writing failed', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <AlertTriangle className={i} /> };
  if (post.status === 'failed') return { key: 'failed', label: 'Failed', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle className={i} /> };
  if (post.needs_review && post.status === 'scheduled') return { key: 'needs_review', label: 'Needs review', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: <Eye className={i} /> };
  if (post.status === 'scheduled') return { key: 'scheduled', label: 'Scheduled', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <Clock className={i} /> };
  return { key: 'draft', label: 'Draft', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: <PenLine className={i} /> };
}

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${status.className}`}>
      {status.icon} {status.label}
    </span>
  );
}
