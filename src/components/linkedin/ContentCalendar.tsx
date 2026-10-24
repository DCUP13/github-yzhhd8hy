import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, FileText, Ban, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { addDays, mondayOf, nudgeEngine, parseISODate, toISODate } from './api';
import { PostEditorModal } from './PostEditorModal';
import { StatusBadge, displayStatus } from './postStatus';
import { CATEGORIES, CATEGORY_STYLES, type EnginePost, type SkipDate } from './types';

type View = 'month' | 'week' | 'day';

interface ContentCalendarProps {
  skipDates: SkipDate[];
  leadDays: number;
  refreshKey: number;
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function postDay(p: EnginePost): string {
  return p.scheduled_for ? toISODate(new Date(p.scheduled_for)) : p.slot_date || '';
}

function timeLabel(p: EnginePost): string {
  return p.scheduled_for ? new Date(p.scheduled_for).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

function canRegenerate(p: EnginePost): boolean {
  return p.status !== 'published' && p.status !== 'publishing' && p.generation_status !== 'generating' && p.generation_status !== 'none';
}

export function ContentCalendar({ skipDates, leadDays, refreshKey }: ContentCalendarProps) {
  const today = toISODate(new Date());
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(today);
  const [posts, setPosts] = useState<EnginePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<EnginePost | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const range = useMemo(() => {
    if (view === 'day') return { start: cursor, end: addDays(cursor, 1) };
    if (view === 'week') { const s = mondayOf(cursor); return { start: s, end: addDays(s, 7) }; }
    const first = cursor.slice(0, 8) + '01';
    const s = mondayOf(first);
    return { start: s, end: addDays(s, 42) };
  }, [view, cursor]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error } = await supabase
      .from('linkedin_posts')
      .select('*')
      .gte('scheduled_for', parseISODate(range.start).toISOString())
      .lt('scheduled_for', parseISODate(range.end).toISOString())
      .order('scheduled_for', { ascending: true });
    setLoading(false);
    if (error) { setLoadError(true); return; }
    setLoadError(false);
    setPosts((data || []) as EnginePost[]);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { if (refreshKey) loadRef.current(true); }, [refreshKey]);

  const anyWriting = posts.some((p) => p.generation_status === 'generating' || (p.generation_status === 'pending' && displayStatus(p, leadDays).key === 'writing'));
  useEffect(() => {
    if (!anyWriting) return;
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [anyWriting, load]);

  const byDay = useMemo(() => {
    const m = new Map<string, EnginePost[]>();
    for (const p of posts) {
      const k = postDay(p);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [posts]);

  const skipSet = useMemo(() => new Set(skipDates.map((s) => s.skip_date)), [skipDates]);
  const reviewCount = posts.filter((p) => displayStatus(p, leadDays).key === 'needs_review').length;

  const move = (dir: number) => {
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

  const regenerateMany = async (list: EnginePost[], label: string) => {
    const targets = list.filter(canRegenerate);
    if (targets.length === 0) { toast.info('Nothing to regenerate here'); return; }
    const ok = await showConfirm({ message: `Rewrite ${targets.length} ${targets.length === 1 ? 'post' : 'posts'} for ${label}? Current text and AI guides will be replaced. Posted items are left alone.`, confirmText: 'Regenerate' });
    if (!ok) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from('linkedin_posts')
      .update({ generation_status: 'pending', generation_error: null, updated_at: new Date().toISOString() })
      .in('id', targets.map((p) => p.id));
    setBulkBusy(false);
    if (error) { toast.error('Could not queue the rewrite'); return; }
    nudgeEngine();
    toast.success(`${targets.length} ${targets.length === 1 ? 'post' : 'posts'} queued for rewriting`);
    load(true);
  };

  const openDay = (d: string) => { setCursor(d); setView('day'); };

  const chip = (p: EnginePost, compact: boolean, narrow = false) => {
    const st = displayStatus(p, leadDays);
    const cat = p.category ? CATEGORY_STYLES[p.category] : null;
    return (
      <button
        key={p.id}
        onClick={(e) => { e.stopPropagation(); setEditing(p); }}
        className={`block w-full text-left rounded-md border-l-[3px] ${cat ? cat.bar : 'border-gray-300'} bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:-translate-y-px transition-all ${compact ? 'px-1.5 py-1' : narrow ? 'px-2 py-2' : 'px-3 py-2.5'}`}
      >
        <div className={narrow ? 'flex flex-col items-start gap-1' : 'flex items-center gap-1.5'}>
          <span className="text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">{timeLabel(p)}</span>
          {compact ? (
            <span className={`ml-auto w-2 h-2 rounded-full ${st.key === 'needs_review' ? 'bg-amber-500' : st.key === 'published' ? 'bg-green-500' : st.key === 'failed' || st.key === 'write_failed' ? 'bg-red-500' : st.key === 'writing' ? 'bg-sky-400 animate-pulse' : 'bg-transparent'}`} title={st.label} />
          ) : (
            <span className={narrow ? 'max-w-full' : 'ml-auto'}><StatusBadge status={st} /></span>
          )}
        </div>
        <p className={`text-gray-800 dark:text-gray-100 ${compact ? 'text-xs truncate' : narrow ? 'text-[13px] font-medium leading-snug mt-1.5 break-words' : 'text-sm font-medium mt-1'}`}>{p.topic_name || 'Untitled'}</p>
        {!compact && (
          <>
            <p className={`mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400 break-words overflow-hidden ${narrow ? 'line-clamp-4 max-h-[6.5em]' : 'line-clamp-3 max-h-[4.875em]'}`}>{p.content_text || (p.generation_status === 'failed' ? 'Writing failed. Open to retry.' : 'Not written yet.')}</p>
            {p.document_url && <p className="mt-1.5 flex items-center gap-1 text-xs text-[#0A66C2] min-w-0"><FileText className="w-3 h-3 flex-shrink-0" /><span className="truncate">{p.document_name || 'Document'}</span></p>}
          </>
        )}
      </button>
    );
  };

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
                className={`min-h-[64px] sm:min-h-[112px] p-1 sm:p-1.5 border-b border-r border-gray-100 dark:border-gray-700/60 cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-gray-700/30 ${inMonth ? '' : 'bg-gray-50/60 dark:bg-gray-900/30'} ${skipped ? 'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(148,163,184,0.12)_6px,rgba(148,163,184,0.12)_12px)]' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${d === today ? 'bg-[#0A66C2] text-white' : inMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'}`}>
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
                    {list.slice(0, 4).map((p) => (
                      <span key={p.id} className={`w-1.5 h-1.5 rounded-full ${p.category ? CATEGORY_STYLES[p.category].dot : 'bg-gray-400'}`} />
                    ))}
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
          <div key={d} className={`min-w-0 rounded-xl border p-1.5 lg:min-h-[220px] ${d === today ? 'border-[#0A66C2]/40 bg-blue-50/40 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
            <button onClick={() => openDay(d)} className="w-full flex items-baseline justify-between mb-2 px-1 group">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{DAY_HEADERS[i]}</span>
              <span className={`text-lg font-semibold group-hover:text-[#0A66C2] ${d === today ? 'text-[#0A66C2]' : 'text-gray-800 dark:text-gray-100'}`}>{parseISODate(d).getDate()}</span>
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
          <button onClick={() => move(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Previous"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => move(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Next"><ChevronRight className="w-5 h-5" /></button>
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
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-sm font-medium rounded-md capitalize transition-colors ${view === v ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        {CATEGORIES.map((c) => (
          <span key={c.value} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_STYLES[c.value].dot}`} />{c.label}</span>
        ))}
        {reviewCount > 0 && <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500" />{reviewCount} research {reviewCount === 1 ? 'post needs' : 'posts need'} review</span>}
      </div>

      {loadError ? (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          Could not load the calendar. <button onClick={() => load()} className="underline font-medium">Try again</button>
        </div>
      ) : view === 'month' ? renderMonth() : view === 'week' ? renderWeek() : renderDay()}

      {editing && (
        <PostEditorModal
          post={editing}
          leadDays={leadDays}
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
