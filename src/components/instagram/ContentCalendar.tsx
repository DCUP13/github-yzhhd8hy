import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Ban, CalendarDays, Images, Link2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { addDays, mondayOf, parseISODate, toISODate } from '../linkedin/api';
import { MoveDayMenu } from '../linkedin/MoveDayMenu';
import { nudgeEngine } from './api';
import { PostEditorModal } from './PostEditorModal';
import { StatusBadge, displayStatus, isLocked } from './postStatus';
import type { IgAccountLite, SavedLink, ScheduledPost, SkipDate } from './types';

type View = 'month' | 'week' | 'day';

interface ContentCalendarProps {
  skipDates: SkipDate[];
  accounts: IgAccountLite[];
  links: SavedLink[];
  refreshKey: number;
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const postDay = (p: ScheduledPost) => toISODate(new Date(p.scheduled_for));
const timeLabel = (p: ScheduledPost) => new Date(p.scheduled_for).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const canRegenerate = (p: ScheduledPost) => !isLocked(p) && p.generation_status !== 'pending';

export function ContentCalendar({ skipDates, accounts, links, refreshKey }: ContentCalendarProps) {
  const today = toISODate(new Date());
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(today);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<ScheduledPost | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === 'day') return { start: cursor, end: addDays(cursor, 1) };
    if (view === 'week') { const s = mondayOf(cursor); return { start: s, end: addDays(s, 7) }; }
    const s = mondayOf(cursor.slice(0, 8) + '01');
    return { start: s, end: addDays(s, 42) };
  }, [view, cursor]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error } = await supabase
      .from('instagram_scheduled_posts')
      .select('*')
      .gte('scheduled_for', parseISODate(range.start).toISOString())
      .lt('scheduled_for', parseISODate(range.end).toISOString())
      .order('scheduled_for', { ascending: true });
    setLoading(false);
    if (error) { setLoadError(true); return; }
    setLoadError(false);
    setPosts((data || []) as ScheduledPost[]);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { if (refreshKey) loadRef.current(true); }, [refreshKey]);

  const anyBusy = posts.some((p) => p.generation_status === 'pending' || p.generation_status === 'generating' || p.status === 'publishing');
  useEffect(() => {
    if (!anyBusy) return;
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [anyBusy, load]);

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduledPost[]>();
    for (const p of posts) {
      const k = postDay(p);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [posts]);

  const skipSet = useMemo(() => new Set(skipDates.map((s) => s.skip_date)), [skipDates]);

  const step = (dir: number) => {
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else {
      const d = parseISODate(cursor.slice(0, 8) + '01');
      d.setMonth(d.getMonth() + dir);
      setCursor(toISODate(d));
    }
  };

  const title = useMemo(() => {
    const c = parseISODate(cursor);
    if (view === 'month') return c.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'day') return c.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const s = parseISODate(range.start);
    const e = parseISODate(addDays(range.start, 6));
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [view, cursor, range]);

  const movePost = async (id: string, targetDay: string) => {
    const p = posts.find((x) => x.id === id);
    if (!p) return;
    const from = postDay(p);
    if (from === targetDay) return;
    if (isLocked(p)) { toast.info('Posts that are publishing or already posted cannot be moved'); return; }
    if (targetDay < today) { toast.info('Posts can only be moved to today or a later day'); return; }
    const diff = Math.round((parseISODate(targetDay).getTime() - parseISODate(from).getTime()) / 86400000);
    const next = new Date(p.scheduled_for);
    next.setDate(next.getDate() + diff);
    if (next <= new Date()) { toast.info('That time has already passed today. Open the post to pick a later time.'); return; }
    const scheduled_for = next.toISOString();
    setPosts((prev) => prev.map((x) => (x.id === id ? { ...x, scheduled_for } : x)));
    const { error } = await supabase
      .from('instagram_scheduled_posts')
      .update({ scheduled_for, updated_at: new Date().toISOString() })
      .eq('id', id)
      .not('status', 'in', '(publishing,published,partial)');
    if (error) { toast.error('Could not move the post'); load(true); return; }
    toast.success(`Moved to ${parseISODate(targetDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`);
  };

  const regenerateMany = async (list: ScheduledPost[], label: string) => {
    const targets = list.filter(canRegenerate);
    if (targets.length === 0) { toast.info('Nothing to regenerate here'); return; }
    const ok = await showConfirm({ message: `Re-prepare ${targets.length} ${targets.length === 1 ? 'post' : 'posts'} for ${label}? Captions and photos will be replaced. Posted items are left alone.`, confirmText: 'Regenerate' });
    if (!ok) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from('instagram_scheduled_posts')
      .update({ generation_status: 'pending', generation_error: null, updated_at: new Date().toISOString() })
      .in('id', targets.map((p) => p.id));
    setBulkBusy(false);
    if (error) { toast.error('Could not queue the rewrite'); return; }
    nudgeEngine();
    toast.success(`${targets.length} ${targets.length === 1 ? 'post' : 'posts'} queued`);
    load(true);
  };

  const dropProps = (d: string) => ({
    onDragOver: (e: DragEvent) => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overDay !== d) setOverDay(d); },
    onDragLeave: () => setOverDay((o) => (o === d ? null : o)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || dragId;
      setDragId(null); setOverDay(null);
      if (id) movePost(id, d);
    },
  });

  const openDay = (d: string) => { setCursor(d); setView('day'); };

  const chip = (p: ScheduledPost, compact: boolean, withMove = false) => {
    const st = displayStatus(p);
    const movable = !isLocked(p);
    const thumb = p.media_urls?.[0];
    return (
      <div key={p.id} className={`relative group ${dragId === p.id ? 'opacity-40' : ''}`}>
        <button
          draggable={movable}
          onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; setDragId(p.id); }}
          onDragEnd={() => { setDragId(null); setOverDay(null); }}
          onClick={(e) => { e.stopPropagation(); setEditing(p); }}
          className={`flex w-full text-left gap-2 rounded-md border-l-[3px] border-pink-400 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:-translate-y-px transition-all ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${compact ? 'px-1.5 py-1 items-center' : 'p-2'}`}
        >
          {thumb ? (
            <img src={thumb} alt="" loading="lazy" className={`flex-shrink-0 rounded object-cover bg-gray-100 ${compact ? 'w-5 h-5' : 'w-12 h-12'}`} />
          ) : (
            <span className={`flex-shrink-0 rounded bg-gray-100 dark:bg-gray-700 ${compact ? 'w-5 h-5' : 'w-12 h-12'}`} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">{timeLabel(p)}</span>
              {compact ? <span className={`ml-auto w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} title={st.label} /> : (
                <span className="ml-auto flex items-center gap-1 text-gray-400">
                  {p.media_urls.length > 1 && <Images className="w-3 h-3" />}
                  {p.link_id && <Link2 className="w-3 h-3" />}
                </span>
              )}
            </div>
            {!compact && (
              <>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300 line-clamp-2 break-words">{p.caption || (p.generation_status === 'failed' ? 'Preparing failed. Open to retry.' : 'Not written yet.')}</p>
                <div className="mt-1.5"><StatusBadge status={st} /></div>
              </>
            )}
            {compact && <span className="sr-only">{st.label}</span>}
          </div>
        </button>
        {withMove && movable && (
          <div className="absolute top-1 right-1 lg:opacity-0 lg:group-hover:opacity-100 bg-white/90 dark:bg-gray-800/90 rounded">
            <MoveDayMenu
              currentDay={parseISODate(postDay(p)).getDay()}
              onMove={(day) => movePost(p.id, addDays(range.start, (day + 6) % 7))}
              onOpenChange={() => {}}
            />
          </div>
        )}
      </div>
    );
  };

  const dropHighlight = (d: string) => (overDay === d ? 'ring-2 ring-inset ring-pink-400 bg-pink-50/60 dark:bg-pink-900/20' : '');
  const skipPattern = 'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(148,163,184,0.12)_6px,rgba(148,163,184,0.12)_12px)]';

  const renderMonth = () => {
    const month = cursor.slice(0, 7);
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
          {DAY_HEADERS.map((d) => <div key={d} className="px-0.5 sm:px-2 py-2 text-[10px] sm:text-xs font-semibold uppercase sm:tracking-wide text-gray-500 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 42 }, (_, i) => {
            const d = addDays(range.start, i);
            const list = byDay.get(d) || [];
            const inMonth = d.startsWith(month);
            const skipped = skipSet.has(d);
            return (
              <div
                key={d}
                onClick={() => openDay(d)}
                {...dropProps(d)}
                className={`min-h-[64px] sm:min-h-[112px] p-1 sm:p-1.5 border-b border-r border-gray-100 dark:border-gray-700/60 cursor-pointer transition-colors hover:bg-pink-50/40 dark:hover:bg-gray-700/30 ${inMonth ? '' : 'bg-gray-50/60 dark:bg-gray-900/30'} ${skipped ? skipPattern : ''} ${dropHighlight(d)}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${d === today ? 'bg-pink-600 text-white' : inMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'}`}>
                    {parseISODate(d).getDate()}
                  </span>
                  {skipped && <Ban className="w-3.5 h-3.5 text-gray-400" aria-label="Skipped" />}
                </div>
                <div className="hidden sm:flex flex-col gap-1">
                  {list.slice(0, 3).map((p) => chip(p, true))}
                  {list.length > 3 && <p className="text-[11px] font-medium text-gray-500 px-1">+{list.length - 3} more</p>}
                </div>
                {list.length > 0 && (
                  <div className="flex sm:hidden flex-wrap items-center gap-0.5 px-0.5">
                    {list.slice(0, 4).map((p) => <span key={p.id} className={`w-1.5 h-1.5 rounded-full ${displayStatus(p).dot}`} />)}
                    {list.length > 4 && <span className="text-[9px] font-medium text-gray-500">+{list.length - 4}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeek = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(range.start, i);
        const list = byDay.get(d) || [];
        const skipped = skipSet.has(d);
        return (
          <div key={d} {...dropProps(d)} className={`min-w-0 rounded-xl border p-1.5 lg:min-h-[260px] transition-colors ${d === today ? 'border-pink-300 bg-pink-50/40 dark:border-pink-800 dark:bg-pink-900/10' : 'border-gray-200 dark:border-gray-700'} ${skipped ? skipPattern : ''} ${dropHighlight(d)}`}>
            <button onClick={() => openDay(d)} className="w-full flex items-baseline justify-between mb-2 px-1 group">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{DAY_HEADERS[i]}</span>
              <span className={`text-lg font-semibold group-hover:text-pink-600 ${d === today ? 'text-pink-600' : 'text-gray-800 dark:text-gray-100'}`}>{parseISODate(d).getDate()}</span>
            </button>
            {skipped && <p className="flex items-center gap-1 text-xs text-gray-400 px-1 mb-2"><Ban className="w-3 h-3" /> Skipped</p>}
            <div className="flex flex-col gap-2">{list.map((p) => chip(p, false, true))}</div>
          </div>
        );
      })}
    </div>
  );

  const renderDay = () => {
    const list = byDay.get(cursor) || [];
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-3">
        {skipSet.has(cursor) && <p className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-500"><Ban className="w-4 h-4" /> This day is skipped. Nothing will be generated for it.</p>}
        {list.length === 0 && !skipSet.has(cursor) && (
          <div className="py-16 text-center">
            <CalendarDays className="w-10 h-10 mx-auto text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No posts on this day.</p>
          </div>
        )}
        {list.map((p) => chip(p, false))}
      </div>
    );
  };

  const visibleForBulk = view === 'day' ? byDay.get(cursor) || [] : view === 'week' ? posts : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Previous"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => step(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Next"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        <button onClick={() => setCursor(today)} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Today</button>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        <div className="ml-auto flex items-center gap-2">
          {view !== 'month' && (
            <button onClick={() => regenerateMany(visibleForBulk, view === 'day' ? 'this day' : 'this week')} disabled={bulkBusy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Regenerate {view}
            </button>
          )}
          <div className="inline-flex p-1 rounded-lg bg-gray-100 dark:bg-gray-700">
            {(['month', 'week', 'day'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-sm font-medium rounded-md capitalize transition-colors ${view === v ? 'bg-white dark:bg-gray-800 text-pink-700 dark:text-pink-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500">Drag a post to another day to move it. It keeps its time. On a phone, use the week view and the move button on each post.</p>

      {loadError ? (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          Could not load the calendar. <button onClick={() => load()} className="underline font-medium">Try again</button>
        </div>
      ) : view === 'month' ? renderMonth() : view === 'week' ? renderWeek() : renderDay()}

      {editing && (
        <PostEditorModal
          post={editing}
          accounts={accounts}
          links={links}
          onClose={() => setEditing(null)}
          onChanged={(p) => {
            if (p) { setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x))); setEditing((e) => (e ? p : e)); }
            else load(true);
          }}
        />
      )}
    </div>
  );
}
