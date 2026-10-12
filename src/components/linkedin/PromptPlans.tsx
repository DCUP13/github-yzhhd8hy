import React, { useEffect, useState } from 'react';
import { Plus, Copy, Trash2, Clock, FileText, Sparkles, LayoutGrid, Mic } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { SlotEditor } from './SlotEditor';
import { formatTime } from './api';
import { inputClass, primaryBtn, secondaryBtn } from './Modal';
import { CATEGORY_STYLES, WEEK_DAYS, type PlanSlot, type PromptPlan, type Topic, type VoiceSample } from './types';

interface PromptPlansProps {
  plans: PromptPlan[];
  slots: PlanSlot[];
  topics: Topic[];
  samples: VoiceSample[];
  onChange: () => void;
}

export function PromptPlans({ plans, slots, topics, samples, onChange }: PromptPlansProps) {
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id || null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editor, setEditor] = useState<{ slot: PlanSlot | null; day: number } | null>(null);

  const plan = plans.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    if (!plan && plans.length > 0) setSelectedId(plans[0].id);
  }, [plan, plans]);

  useEffect(() => {
    setName(plan?.name || '');
    setDescription(plan?.description || '');
  }, [plan?.id, plan?.name, plan?.description]);

  const createPlan = async () => {
    const { data, error } = await supabase.from('linkedin_prompt_plans').insert({ name: `Plan ${plans.length + 1}` }).select('id').maybeSingle();
    if (error || !data) {
      toast.error('Could not create plan');
      return;
    }
    setSelectedId(data.id);
    onChange();
  };

  const savePlanField = async (patch: Partial<PromptPlan>) => {
    if (!plan) return;
    const { error } = await supabase.from('linkedin_prompt_plans').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', plan.id);
    if (error) toast.error('Could not save plan');
    else onChange();
  };

  const toggleDay = (day: number) => {
    if (!plan) return;
    const next = plan.active_days.includes(day) ? plan.active_days.filter((d) => d !== day) : [...plan.active_days, day];
    savePlanField({ active_days: next });
  };

  const duplicatePlan = async () => {
    if (!plan) return;
    const { data, error } = await supabase
      .from('linkedin_prompt_plans')
      .insert({ name: `${plan.name} (copy)`, description: plan.description, active_days: plan.active_days })
      .select('id')
      .maybeSingle();
    if (error || !data) {
      toast.error('Could not duplicate plan');
      return;
    }
    const copies = slots.filter((s) => s.plan_id === plan.id).map(({ id: _id, plan_id: _p, ...rest }) => ({ ...rest, plan_id: data.id }));
    if (copies.length) {
      const { error: slotErr } = await supabase.from('linkedin_plan_slots').insert(copies);
      if (slotErr) toast.error('Plan copied, but some slots failed to copy');
    }
    toast.success('Plan duplicated');
    setSelectedId(data.id);
    onChange();
  };

  const deletePlan = async () => {
    if (!plan) return;
    const ok = await showConfirm({
      message: `Delete "${plan.name}"? It will also be removed from your timeline. Posts already generated from it are kept.`,
      variant: 'danger',
      confirmText: 'Delete plan',
    });
    if (!ok) return;
    const { error } = await supabase.from('linkedin_prompt_plans').delete().eq('id', plan.id);
    if (error) {
      toast.error('Could not delete plan');
      return;
    }
    setSelectedId(null);
    onChange();
  };

  const duplicateSlot = async (s: PlanSlot) => {
    const { id: _id, ...rest } = s;
    const { error } = await supabase.from('linkedin_plan_slots').insert({ ...rest, position: s.position + 1 });
    if (error) toast.error('Could not duplicate slot');
    else onChange();
  };

  const deleteSlot = async (s: PlanSlot) => {
    const ok = await showConfirm({ message: 'Delete this post slot?', variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    const { error } = await supabase.from('linkedin_plan_slots').delete().eq('id', s.id);
    if (error) toast.error('Could not delete slot');
    else onChange();
  };

  if (plans.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#0A66C2]/10 flex items-center justify-center">
          <LayoutGrid className="w-6 h-6 text-[#0A66C2]" />
        </div>
        <p className="font-medium text-gray-900 dark:text-white">Create your first weekly plan</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">A plan is a reusable week: what to post each day, when, about what, and how it should be written.</p>
        <button onClick={createPlan} className={`${primaryBtn} mt-6`}><Plus className="w-4 h-4" /> New plan</button>
      </div>
    );
  }

  const topicName = (id: string | null) => topics.find((t) => t.id === id)?.name;
  const sampleName = (id: string | null) => samples.find((s) => s.id === id)?.name;
  const planSlots = slots.filter((s) => s.plan_id === plan?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${p.id === plan?.id ? 'bg-[#0A66C2] text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {p.name}
            </button>
          ))}
          <button onClick={createPlan} className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium text-[#0A66C2] hover:bg-[#0A66C2]/10 transition-colors">
            <Plus className="w-4 h-4" /> New plan
          </button>
        </div>
        {plan && (
          <div className="flex gap-2">
            <button onClick={duplicatePlan} className={secondaryBtn}><Copy className="w-4 h-4" /> Duplicate</button>
            <button onClick={deletePlan} className={`${secondaryBtn} hover:!text-red-600 hover:!border-red-300`}><Trash2 className="w-4 h-4" /> Delete</button>
          </div>
        )}
      </div>

      {plan && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== plan.name && savePlanField({ name: name.trim() })}
              className={`${inputClass} text-base font-semibold`}
              placeholder="Plan name"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== plan.description && savePlanField({ description })}
              className={`${inputClass} md:col-span-2`}
              placeholder="What is this plan for? e.g. Q1 authority building"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {WEEK_DAYS.map((d) => {
              const active = plan.active_days.includes(d.value);
              const daySlots = planSlots.filter((s) => s.day_of_week === d.value).sort((a, b) => a.post_time.localeCompare(b.post_time) || a.position - b.position);
              return (
                <div key={d.value} className={`flex flex-col rounded-2xl border transition-colors ${active ? 'border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60' : 'border-dashed border-gray-200 dark:border-gray-700 bg-transparent'}`}>
                  <div className="flex items-center justify-between px-3 pt-3 pb-2">
                    <span className={`text-sm font-semibold ${active ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{d.long}</span>
                    <button
                      onClick={() => toggleDay(d.value)}
                      role="switch"
                      aria-checked={active}
                      title={active ? 'Posting on this day' : 'Skipping this day'}
                      className={`relative w-9 h-5 rounded-full transition-colors ${active ? 'bg-[#0A66C2]' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : ''}`} />
                    </button>
                  </div>
                  <div className={`flex-1 px-2 pb-2 space-y-2 ${active ? '' : 'opacity-40'}`}>
                    {daySlots.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => setEditor({ slot: s, day: d.value })}
                        className={`group relative cursor-pointer rounded-xl border-l-4 ${CATEGORY_STYLES[s.category].bar} bg-white dark:bg-gray-900 p-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all`}
                      >
                        <div className="flex items-center gap-1 text-xs font-semibold text-gray-900 dark:text-white">
                          <Clock className="w-3 h-3 text-gray-400" /> {formatTime(s.post_time)}
                          {s.guide_mode === 'ai' && <Sparkles className="w-3 h-3 ml-auto text-[#0A66C2]" />}
                          {s.guide_mode === 'upload' && <FileText className="w-3 h-3 ml-auto text-[#0A66C2]" />}
                        </div>
                        <p className="mt-1 text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">{s.category}</p>
                        <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-200 line-clamp-2">{topicName(s.topic_id) || 'No topic selected'}</p>
                        {sampleName(s.voice_sample_id) && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400 truncate"><Mic className="w-3 h-3" /> {sampleName(s.voice_sample_id)}</p>
                        )}
                        <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-0.5 bg-white dark:bg-gray-900 rounded-md">
                          <button onClick={(e) => { e.stopPropagation(); duplicateSlot(s); }} className="p-1 rounded text-gray-400 hover:text-[#0A66C2]" aria-label="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteSlot(s); }} className="p-1 rounded text-gray-400 hover:text-red-600" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setEditor({ slot: null, day: d.value })}
                      className="w-full flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-500 hover:text-[#0A66C2] hover:border-[#0A66C2] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add post
                    </button>
                  </div>
                  <div className="px-3 pb-2 text-[11px] text-gray-400">{daySlots.length} {daySlots.length === 1 ? 'post' : 'posts'}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editor && plan && (
        <SlotEditor
          planId={plan.id}
          slot={editor.slot}
          dayOfWeek={editor.day}
          topics={topics}
          samples={samples}
          onClose={() => setEditor(null)}
          onSaved={onChange}
        />
      )}
    </div>
  );
}
