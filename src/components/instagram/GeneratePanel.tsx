import { useCallback, useEffect, useState } from 'react';
import { Wand2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { addDays, formatDay, mondayOf, toISODate } from '../linkedin/api';
import { labelClass } from '../linkedin/Modal';
import { nudgeEngine } from './api';
import { PINK } from './types';

type RangeKind = 'this' | 'next' | 'custom' | 'year';

interface Job {
  id: string;
  start_week: string;
  end_week: string;
  total_posts: number;
}

interface JobProgress {
  done: number;
  failed: number;
  working: number;
}

interface GeneratePanelProps {
  hasAssignments: boolean;
  refreshKey: number;
  onGenerated: () => void;
}

const OPTIONS: { value: RangeKind; label: string }[] = [
  { value: 'this', label: 'This week' },
  { value: 'next', label: 'Next week' },
  { value: 'custom', label: 'Choose weeks' },
  { value: 'year', label: 'Rest of the year' },
];

export function GeneratePanel({ hasAssignments, refreshKey, onGenerated }: GeneratePanelProps) {
  const thisMonday = mondayOf(toISODate(new Date()));
  const [kind, setKind] = useState<RangeKind>('next');
  const [from, setFrom] = useState(thisMonday);
  const [to, setTo] = useState(addDays(thisMonday, 28));
  const [replace, setReplace] = useState(false);
  const [running, setRunning] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [progress, setProgress] = useState<Record<string, JobProgress>>({});

  const range = (): [string, string] => {
    if (kind === 'this') return [thisMonday, thisMonday];
    if (kind === 'next') return [addDays(thisMonday, 7), addDays(thisMonday, 7)];
    if (kind === 'year') return [thisMonday, mondayOf(`${new Date().getFullYear()}-12-31`)];
    return [mondayOf(from), mondayOf(to)];
  };

  const loadJobs = useCallback(async () => {
    const { data } = await supabase.from('instagram_generation_jobs').select('id, start_week, end_week, total_posts').order('created_at', { ascending: false }).limit(4);
    const list = (data || []) as Job[];
    setJobs(list);
    const entries = await Promise.all(list.map(async (j) => {
      const base = () => supabase.from('instagram_scheduled_posts').select('id', { count: 'exact', head: true }).eq('generation_job_id', j.id);
      const [done, failed, working] = await Promise.all([
        base().eq('generation_status', 'done'),
        base().eq('generation_status', 'failed'),
        base().in('generation_status', ['pending', 'generating']),
      ]);
      return [j.id, { done: done.count || 0, failed: failed.count || 0, working: working.count || 0 }] as const;
    }));
    setProgress(Object.fromEntries(entries));
  }, []);

  const anyWorking = Object.values(progress).some((p) => p.working > 0);

  useEffect(() => { loadJobs(); }, [loadJobs, refreshKey]);

  useEffect(() => {
    if (!anyWorking) return;
    const t = setInterval(loadJobs, 8000);
    return () => clearInterval(t);
  }, [anyWorking, loadJobs]);

  const run = async () => {
    const [start, end] = range();
    if (end < start) {
      toast.error('The end week must be after the start week');
      return;
    }
    if (replace) {
      const ok = await showConfirm({
        message: `Replace unpublished generated posts from ${formatDay(start)} to ${formatDay(addDays(end, 6))}? Any edits you made to them will be lost.`,
        variant: 'danger',
        confirmText: 'Replace and regenerate',
      });
      if (!ok) return;
    }
    setRunning(true);
    const { data, error } = await supabase.rpc('instagram_generate_weeks', { p_start: start, p_end: end, p_replace: replace });
    setRunning(false);
    if (error) {
      toast.error(error.message || 'Could not start generation');
      return;
    }
    const created = (data as { created?: number } | null)?.created ?? 0;
    if (created === 0) toast.info('Nothing new to generate in that range. Weeks already generated are kept unless you choose replace.');
    else toast.success(`${created} posts queued. Captions and photos are being prepared.`);
    setReplace(false);
    nudgeEngine();
    loadJobs();
    onGenerated();
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
          <Wand2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Generate posts</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Captions are written and photos picked in the background, then each post is scheduled to its plan's accounts. You can edit everything on the calendar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setKind(o.value)}
            className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${kind === o.value ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {kind === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>From week of</label>
            <input type="date" value={from} onChange={(e) => e.target.value && setFrom(mondayOf(e.target.value))} className={PINK.input} />
          </div>
          <div>
            <label className={labelClass}>Through week of</label>
            <input type="date" value={to} onChange={(e) => e.target.value && setTo(mondayOf(e.target.value))} className={PINK.input} />
          </div>
        </div>
      )}

      <p className="text-sm text-gray-600 dark:text-gray-300">
        {(() => { const [s, e] = range(); return `${formatDay(s, { month: 'short', day: 'numeric', year: 'numeric' })} - ${formatDay(addDays(e, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`; })()}
      </p>

      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
        <span>Replace posts already generated in this range <span className="text-gray-400">(published posts are never touched)</span></span>
      </label>

      <button onClick={run} disabled={running || !hasAssignments} className={`${PINK.primary} w-full py-2.5`}>
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        {hasAssignments ? 'Generate' : 'Add a plan to the timeline first'}
      </button>

      {jobs.length > 0 && (
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
          <p className={labelClass}>Recent runs</p>
          {jobs.map((j) => {
            const p = progress[j.id];
            const total = j.total_posts;
            const finished = (p?.done || 0) + (p?.failed || 0);
            const pct = total > 0 ? Math.round((finished / total) * 100) : 100;
            return (
              <div key={j.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">{formatDay(j.start_week)} - {formatDay(addDays(j.end_week, 6))}</span>
                  <span className="text-gray-500 tabular-nums">{total === 0 ? 'No new posts' : `${finished}/${total}`}</span>
                </div>
                {total > 0 && (
                  <>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${p?.failed ? 'bg-amber-500' : 'bg-pink-600'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {(p?.working || 0) > 0 && <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {p?.working} preparing</span>}
                      {(p?.done || 0) > 0 && <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" /> {p?.done} ready</span>}
                      {(p?.failed || 0) > 0 && <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle className="w-3 h-3" /> {p?.failed} failed (retry from the calendar)</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
