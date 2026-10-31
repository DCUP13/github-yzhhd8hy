import { useCallback, useEffect, useMemo, useState } from 'react';
import { Images, Instagram, Link2, Loader2, MessageSquareText, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { secondaryBtn } from '../linkedin/Modal';
import { syncInsights } from './api';
import { PostEditorModal } from './PostEditorModal';
import { StatsRow } from './PostInsights';
import { StatusBadge, displayStatus } from './postStatus';
import type { ContentData } from './useContentData';
import { THEME, type IgAccountLite, type ScheduledPost, type ThreadsAccount } from './types';

type Filter = 'upcoming' | 'posted' | 'drafts';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'posted', label: 'Posted' },
  { id: 'drafts', label: 'Drafts and issues' },
];

interface Props {
  data: ContentData;
  accounts: ThreadsAccount[];
  igAccounts: IgAccountLite[];
  refreshKey: number;
  onLibraryChanged: () => void;
}

export function PostsList({ data, accounts, igAccounts, refreshKey, onLibraryChanged }: Props) {
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from('threads_posts').select('*');
    if (filter === 'upcoming') q = q.in('status', ['scheduled', 'publishing']).order('scheduled_for', { ascending: true }).limit(100);
    else if (filter === 'posted') q = q.in('status', ['published', 'partial', 'deleted']).order('published_at', { ascending: false, nullsFirst: false }).limit(100);
    else q = q.in('status', ['draft', 'failed']).order('updated_at', { ascending: false }).limit(100);
    const { data: rows, error } = await q;
    setLoading(false);
    if (error) { setLoadError(true); return; }
    setLoadError(false);
    setPosts((rows || []) as ScheduledPost[]);
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { if (refreshKey) load(); }, [refreshKey, load]);

  const totals = useMemo(() => {
    if (filter !== 'posted') return null;
    const live = posts.filter((p) => p.status !== 'deleted');
    return { views: live.reduce((n, p) => n + (p.views || 0), 0), likes: live.reduce((n, p) => n + (p.likes || 0), 0), count: live.length };
  }, [posts, filter]);

  const refresh = async () => {
    setSyncing(true);
    try {
      const n = await syncInsights();
      toast.success(n ? `Updated stats for ${n} post${n === 1 ? '' : 's'}` : 'Stats are up to date');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not refresh stats');
    } finally {
      setSyncing(false);
    }
  };

  const linkUrl = (id: string | null) => data.links.find((l) => l.id === id)?.url;
  const current = editor?.id ? posts.find((p) => p.id === editor.id) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex p-1 rounded-lg bg-gray-100 dark:bg-gray-700">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === f.id ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {filter === 'posted' && (
            <button onClick={refresh} disabled={syncing} className={secondaryBtn}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh stats
            </button>
          )}
          <button onClick={() => setEditor({ id: null })} className={THEME.primary}><Plus className="w-4 h-4" /> New post</button>
        </div>
      </div>

      {totals && totals.count > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[{ label: 'Posts', value: totals.count }, { label: 'Total views', value: totals.views }, { label: 'Total likes', value: totals.likes }].map((t) => (
            <div key={t.label} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">{t.label}</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{t.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-sky-500" /></div>
      ) : loadError ? (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          Could not load posts. <button onClick={load} className="underline font-medium">Try again</button>
        </div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <MessageSquareText className="w-10 h-10 mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">Nothing here yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => {
            const when = p.published_at || p.scheduled_for;
            return (
              <li key={p.id}>
                <button onClick={() => setEditor({ id: p.id })} className="w-full text-left flex gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md hover:-translate-y-px transition-all">
                  {p.media_urls[0] && <img src={p.media_urls[0]} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={displayStatus(p)} />
                      {when && <span className="text-xs text-gray-500">{new Date(when).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                      <span className="ml-auto flex items-center gap-1.5 text-gray-400">
                        {p.media_urls.length > 1 && <Images className="w-3.5 h-3.5" />}
                        {p.link_id && <Link2 className="w-3.5 h-3.5" />}
                        {p.also_instagram && <Instagram className="w-3.5 h-3.5 text-pink-500" />}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 line-clamp-3 whitespace-pre-wrap break-words">
                      {p.content_text || <span className="text-gray-400">Not written yet</span>}
                      {linkUrl(p.link_id) && <span className="text-sky-600"> {linkUrl(p.link_id)}</span>}
                    </p>
                    {(p.status === 'published' || p.status === 'partial') && <StatsRow post={p} compact />}
                    {(p.publish_error || p.generation_error) && <p className="text-xs text-red-600">{p.publish_error || p.generation_error}</p>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editor && (
        <PostEditorModal
          post={current}
          data={data}
          accounts={accounts}
          igAccounts={igAccounts}
          onClose={() => setEditor(null)}
          onSaved={load}
          onLibraryChanged={onLibraryChanged}
        />
      )}
    </div>
  );
}
