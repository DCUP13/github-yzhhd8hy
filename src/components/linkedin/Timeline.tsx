import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarOff, Settings2, CalendarRange } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { GeneratePanel } from './GeneratePanel';
import { addDays, formatDay, mondayOf, toISODate } from './api';
import { Modal, inputClass, labelClass, primaryBtn, secondaryBtn } from './Modal';
import type { ContentSettings, PlanAssignment, PromptPlan, SkipDate } from './types';

interface TimelineProps {
  plans: PromptPlan[];
  assignments: PlanAssignment[];
  skipDates: SkipDate[];
  settings: ContentSettings;
  onChange: () => void;
  onPostsChanged: () => void;
}

const PLAN_COLORS = [
  { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-800 dark:text-sky-200', solid: 'bg-sky-500' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-200', solid: 'bg-emerald-500' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-200', solid: 'bg-amber-500' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-800 dark:text-rose-200', solid: 'bg-rose-500' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-800 dark:text-teal-200', solid: 'bg-teal-500' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-800 dark:text-orange-200', solid: 'bg-orange-500' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-800 dark:text-cyan-200', solid: 'bg-cyan-500' },
  { bg: 'bg-lime-100 dark:bg-lime-900/40', text: 'text-lime-800 dark:text-lime-200', solid: 'bg-lime-500' },
];

function timezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : ['UTC'];
}

export function Timeline({ plans, assignments, skipDates, settings, onChange, onPostsChanged }: TimelineProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [assignWeek, setAssignWeek] = useState<string | null>(null);
  const [assignPlan, setAssignPlan] = useState('');
  const [skipDate, setSkipDate] = useState('');
  const [skipNote, setSkipNote] = useState('');
  const [jobWeeks, setJobWeeks] = useState<{ start_week: string; end_week: string }[]>([]);
  const [tz, setTz] = useState(settings.timezone);
  const [lead, setLead] = useState(settings.research_lead_days);

  useEffect(() => { setTz(settings.timezone); setLead(settings.research_lead_days); }, [settings]);

  const loadJobWeeks = useCallback(async () => {
    const { data } = await supabase.from('linkedin_generation_jobs').select('start_week, end_week').gt('total_posts', 0).limit(1000);
    setJobWeeks(data || []);
  }, []);

  useEffect(() => { loadJobWeeks(); }, [loadJobWeeks]);

  const colorFor = (planId: string) => PLAN_COLORS[Math.max(0, plans.findIndex((p) => p.id === planId)) % PLAN_COLORS.length];
  const planName = (planId: string) => plans.find((p) => p.id === planId)?.name || 'Plan';

  const weeks = useMemo(() => {
    const out: string[] = [];
    let w = mondayOf(`${year}-01-01`);
    while (w <= `${year}-12-31`) { out.push(w); w = addDays(w, 7); }
    return out;
  }, [year]);

  const sorted = [...assignments].sort((a, b) => a.start_week.localeCompare(b.start_week));
  const planForWeek = (w: string) => [...sorted].reverse().find((a) => a.start_week <= w)?.plan_id || null;
  const isGenerated = (w: string) => jobWeeks.some((j) => j.start_week <= w && j.end_week >= w);
  const skipsInWeek = (w: string) => skipDates.filter((s) => s.skip_date >= w && s.skip_date <= addDays(w, 6)).length;
  const thisMonday = mondayOf(toISODate(new Date()));

  const saveAssignment = async () => {
    if (!assignWeek || !assignPlan) return;
    const { error } = await supabase.from('linkedin_plan_assignments').upsert({ start_week: assignWeek, plan_id: assignPlan }, { onConflict: 'user_id,start_week' });
    if (error) {
      toast.error('Could not update the timeline');
      return;
    }
    toast.success(`${planName(assignPlan)} starts the week of ${formatDay(assignWeek)}`);
    setAssignWeek(null);
    onChange();
  };

  const removeAssignment = async (a: PlanAssignment) => {
    const { error } = await supabase.from('linkedin_plan_assignments').delete().eq('id', a.id);
    if (error) toast.error('Could not remove');
    else onChange();
  };

  const addSkip = async () => {
    if (!skipDate) return;
    const { data: existing } = await supabase
      .from('linkedin_posts')
      .select('id')
      .eq('slot_date', skipDate)
      .in('status', ['draft', 'scheduled', 'failed']);
    if (existing && existing.length > 0) {
      const ok = await showConfirm({
        message: `${existing.length} unpublished ${existing.length === 1 ? 'post is' : 'posts are'} already planned for ${formatDay(skipDate)}. Skip the day and delete ${existing.length === 1 ? 'it' : 'them'}?`,
        variant: 'danger',
        confirmText: 'Skip and delete',
      });
      if (!ok) return;
      const { error: delErr } = await supabase.from('linkedin_posts').delete().in('id', existing.map((p) => p.id));
      if (delErr) {
        toast.error('Could not remove the planned posts');
        return;
      }
      onPostsChanged();
    }
    const { error } = await supabase.from('linkedin_skip_dates').insert({ skip_date: skipDate, note: skipNote.trim() });
    if (error) {
      toast.error(error.code === '23505' ? 'That day is already skipped' : 'Could not skip that day');
      return;
    }
    setSkipDate('');
    setSkipNote('');
    onChange();
  };

  const unskip = async (s: SkipDate) => {
    const { error } = await supabase.from('linkedin_skip_dates').delete().eq('id', s.id);
    if (error) {
      toast.error('Could not un-skip');
      return;
    }
    toast.info('Day restored. Generate that week again to fill it in; existing posts are kept.');
    onChange();
  };

  const saveSettings = async (patch: Partial<ContentSettings>) => {
    const { error } = await supabase.from('linkedin_content_settings').update({ ...patch, updated_at: new Date().toISOString() }).not('user_id', 'is', null);
    if (error) toast.error('Could not save settings');
    else onChange();
  };

  const upcomingSkips = skipDates.filter((s) => s.skip_date >= toISODate(new Date()));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-[#0A66C2]" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Plan timeline</h3>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setYear(year - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
              <span className="w-12 text-center text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{year}</span>
              <button onClick={() => setYear(year + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Click any week to start a plan there. A plan repeats every week until the next plan begins.</p>

          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))' }}>
            {weeks.map((w) => {
              const pid = planForWeek(w);
              const c = pid ? colorFor(pid) : null;
              const starts = sorted.some((a) => a.start_week === w);
              const skips = skipsInWeek(w);
              const past = w < thisMonday;
              return (
                <button
                  key={w}
                  onClick={() => { setAssignWeek(w); setAssignPlan(pid || plans[0]?.id || ''); }}
                  title={`${formatDay(w)}${pid ? ` - ${planName(pid)}` : ''}${isGenerated(w) ? ' - generated' : ''}${skips ? ` - ${skips} skipped` : ''}`}
                  className={`relative h-14 rounded-lg px-1.5 py-1 text-left transition-all hover:ring-2 hover:ring-[#0A66C2]/50 ${c ? `${c.bg} ${c.text}` : 'bg-gray-50 dark:bg-gray-900/50 text-gray-400'} ${past ? 'opacity-50' : ''} ${w === thisMonday ? 'ring-2 ring-[#0A66C2]' : ''}`}
                >
                  {starts && <span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r ${c?.solid}`} />}
                  <span className="block text-[10px] font-semibold leading-tight">{formatDay(w)}</span>
                  <span className="block text-[10px] leading-tight truncate">{pid ? planName(pid) : '-'}</span>
                  <span className="absolute bottom-1 right-1.5 flex gap-0.5">
                    {isGenerated(w) && <span className="w-1.5 h-1.5 rounded-full bg-[#0A66C2]" />}
                    {skips > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#0A66C2]" /> Generated</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Has skipped days</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-1 h-3 rounded bg-gray-400" /> Plan starts</span>
          </div>

          {sorted.length > 0 && (
            <ul className="mt-5 divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
              {sorted.map((a, i) => {
                const next = sorted[i + 1];
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${colorFor(a.plan_id).solid}`} />
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">
                      <span className="font-medium">{planName(a.plan_id)}</span>
                      <span className="text-gray-500"> - week of {formatDay(a.start_week, { month: 'short', day: 'numeric', year: 'numeric' })} {next ? `until ${formatDay(addDays(next.start_week, -1))}` : 'onward'}</span>
                    </span>
                    <button onClick={() => removeAssignment(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarOff className="w-5 h-5 text-red-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Skip days</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Nothing is generated or posted on these dates (holidays, vacations, launches).</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="date" value={skipDate} onChange={(e) => setSkipDate(e.target.value)} className={`${inputClass} sm:w-48`} />
            <input value={skipNote} onChange={(e) => setSkipNote(e.target.value)} placeholder="Reason (optional)" className={inputClass} />
            <button onClick={addSkip} disabled={!skipDate} className={primaryBtn}><Plus className="w-4 h-4" /> Skip</button>
          </div>
          {upcomingSkips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {upcomingSkips.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                  {formatDay(s.skip_date, { weekday: 'short', month: 'short', day: 'numeric' })}{s.note && <span className="text-red-500/70">- {s.note}</span>}
                  <button onClick={() => unskip(s)} className="px-2 py-0.5 rounded-full text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40">Un-skip</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <GeneratePanel researchLeadDays={settings.research_lead_days} hasAssignments={assignments.length > 0} onGenerated={() => { loadJobWeeks(); onPostsChanged(); }} />

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Schedule settings</h3>
          </div>
          <div>
            <label className={labelClass}>Time zone for post times</label>
            <select value={tz} onChange={(e) => { setTz(e.target.value); saveSettings({ timezone: e.target.value }); }} className={inputClass}>
              {timezones().map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Research this many days ahead</label>
            <input
              type="number"
              min={0}
              max={30}
              value={lead}
              onChange={(e) => setLead(Number(e.target.value))}
              onBlur={() => { const v = Math.min(30, Math.max(0, Math.round(lead || 0))); setLead(v); if (v !== settings.research_lead_days) saveSettings({ research_lead_days: v }); }}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Fresh research, but time for you to review. Unreviewed research posts still publish on schedule.</p>
          </div>
        </div>
      </div>

      {assignWeek && (
        <Modal
          title={`Week of ${formatDay(assignWeek, { month: 'long', day: 'numeric', year: 'numeric' })}`}
          subtitle="The chosen plan applies from this week until the next plan change."
          onClose={() => setAssignWeek(null)}
          footer={
            <>
              <button onClick={() => setAssignWeek(null)} className={secondaryBtn}>Cancel</button>
              <button onClick={saveAssignment} disabled={!assignPlan} className={primaryBtn}>Start plan here</button>
            </>
          }
        >
          {plans.length === 0 ? (
            <p className="text-sm text-gray-500">Create a plan in the Prompt Plans tab first.</p>
          ) : (
            <div>
              <label className={labelClass}>Plan</label>
              <select value={assignPlan} onChange={(e) => setAssignPlan(e.target.value)} className={inputClass}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
