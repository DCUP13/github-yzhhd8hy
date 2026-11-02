import { useState } from 'react';
import { ExternalLink, Eye, Heart, Loader2, MessageCircle, Quote, RefreshCw, Repeat2, Send, Trash2 } from 'lucide-react';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { secondaryBtn } from '../linkedin/Modal';
import { deleteFromThreads, syncInsights } from './api';
import type { ScheduledPost } from './types';

const STATS = [
  { key: 'views', label: 'Views', icon: Eye },
  { key: 'likes', label: 'Likes', icon: Heart },
  { key: 'replies', label: 'Replies', icon: MessageCircle },
  { key: 'reposts', label: 'Reposts', icon: Repeat2 },
  { key: 'quotes', label: 'Quotes', icon: Quote },
  { key: 'shares', label: 'Shares', icon: Send },
] as const;

export function StatsRow({ post, compact }: { post: ScheduledPost; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {STATS.map(({ key, icon: Icon }) => (
          <span key={key} className="inline-flex items-center gap-1"><Icon className="w-3.5 h-3.5" />{(post[key] || 0).toLocaleString()}</span>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {STATS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="rounded-xl bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 text-center">
          <Icon className="w-4 h-4 mx-auto text-gray-400" />
          <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{(post[key] || 0).toLocaleString()}</div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  post: ScheduledPost;
  onChanged: () => void;
}

export function PostInsights({ post, onChanged }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const results = Array.isArray(post.publish_results) ? post.publish_results : [];
  const live = post.status === 'published' || post.status === 'partial';

  const refresh = async () => {
    setSyncing(true);
    try {
      const n = await syncInsights();
      toast.success(n ? `Updated stats for ${n} post${n === 1 ? '' : 's'}` : 'Stats are up to date');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not refresh stats');
    } finally {
      setSyncing(false);
    }
  };

  const remove = async () => {
    const ok = await showConfirm({
      message: 'Remove this post from Threads? It will be deleted from every profile it was posted to. This cannot be undone on Threads.',
      variant: 'danger',
      confirmText: 'Remove from Threads',
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await deleteFromThreads(post.id);
      toast.success('Removed from Threads');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the post');
    } finally {
      setRemoving(false);
      onChanged();
    }
  };

  return (
    <div className="space-y-4">
      {live && <StatsRow post={post} />}
      {post.insights_synced_at && live && (
        <p className="text-xs text-gray-500">Stats last updated {new Date(post.insights_synced_at).toLocaleString()}</p>
      )}
      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700">
          {results.map((r) => (
            <li key={r.account_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">@{r.username ?? 'threads'}</span>
              {r.deleted ? (
                <span className="text-xs text-gray-500">Removed</span>
              ) : r.ok ? (
                r.permalink ? (
                  <a href={r.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline">
                    View on Threads <ExternalLink className="w-3 h-3" />
                  </a>
                ) : <span className="text-xs text-green-600">Posted</span>
              ) : (
                <span className="text-xs text-red-600 text-right">{r.error || 'Failed'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {post.publish_error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{post.publish_error}</p>}
      {live && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} disabled={syncing} className={secondaryBtn}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh stats
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
          >
            {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove from Threads
          </button>
        </div>
      )}
    </div>
  );
}
