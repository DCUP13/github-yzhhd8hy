import { useEffect, useState } from 'react';
import { Plus, Copy, Trash2, Clock, LayoutGrid, Mic, GripVertical, Images, Image as ImageIcon, Link2, Type, Users, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { MoveDayMenu } from '../linkedin/MoveDayMenu';
import { useTouchDrag } from '../linkedin/useTouchDrag';
import { formatTime } from '../linkedin/api';
import { secondaryBtn } from '../linkedin/Modal';
import { WEEK_DAYS } from '../linkedin/types';
import { SlotEditor } from './SlotEditor';
import { TouchDragOverlay } from './TouchDragOverlay';
import { PINK, type IgAccountLite, type InstagramPrompt, type PlanSlot, type PromptPlan, type SavedLink, type Topic, type VoiceSample } from './types';

interface PromptPlansProps {
  plans: PromptPlan[];
  slots: PlanSlot[];
  topics: Topic[];
  samples: VoiceSample[];
  prompts: InstagramPrompt[];
  imageTextPrompts: InstagramPrompt[];
  links: SavedLink[];
  accounts: IgAccountLite[];
  onChange: () => void;
}

function AccountsPicker({ plan, accounts, onSave }: { plan: PromptPlan; accounts: IgAccountLite[]; onSave: (ids: string[]) => void }) {
  const toggle = (id: string) => {
    onSave(plan.account_ids.includes(id) ? plan.account_ids.filter((a) => a !== id) : [...plan.account_ids, id]);
  };
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-pink-600" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Default accounts</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">Posts from this plan go to these accounts. You can change accounts on any single post.</span>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500">Connect an Instagram account first.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const on = plan.account_ids.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-sm font-medium transition-all ${
                  on ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300'
                }`}
              >
                {a.profile_picture_url ? (
                  <img src={a.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-orange-400" />
                )}
                @{a.username || 'account'}
                {on && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      )}
      {accounts.length > 0 && plan.account_ids.length === 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">No accounts selected. Generated posts will need accounts before they can publish.</p>
      )}
    </div>
  );
}

export function PromptPlans({ plans, slots, topics, samples, prompts, imageTextPrompts, links, accounts, onChange }: PromptPlansProps) {
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id || null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editor, setEditor] = useState<{ slot: PlanSlot | null; day: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<number | null>(null);
  const [movedDays, setMovedDays] = useState<Record<string, number>>({});
  const [touchMode, setTouchMode] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    setMovedDays({});
  }, [slots]);

  const plan = plans.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    if (!plan && plans.length > 0) setSelectedId(plans[0].id);
  }, [plan, plans]);

  useEffect(() => {
    setName(plan?.name || '');
    setDescription(plan?.description || '');
  }, [plan?.id, plan?.name, plan?.description]);

  const createPlan = async () => {
    const { data, error } = await supabase
      .from('instagram_prompt_plans')
      .insert({ name: `Plan ${plans.length + 1}`, account_ids: accounts.map((a) => a.id) })
      .select('id')
      .maybeSingle();
    if (error || !data) {
      toast.error('Could not create plan');
      return;
    }
    setSelectedId(data.id);
    onChange();
  };

  const savePlanField = async (patch: Partial<PromptPlan>) => {
    if (!plan) return;
    const { error } = await supabase.from('instagram_prompt_plans').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', plan.id);
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
      .from('instagram_prompt_plans')
      .insert({ name: `${plan.name} (copy)`, description: plan.description, active_days: plan.active_days, account_ids: plan.account_ids })
      .select('id')
      .maybeSingle();
    if (error || !data) {
      toast.error('Could not duplicate plan');
      return;
    }
    const copies = slots.filter((s) => s.plan_id === plan.id).map(({ id: _id, plan_id: _p, ...rest }) => ({ ...rest, plan_id: data.id }));
    if (copies.length) {
      const { error: slotErr } = await supabase.from('instagram_plan_slots').insert(copies);
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
    const { error } = await supabase.from('instagram_prompt_plans').delete().eq('id', plan.id);
    if (error) {
      toast.error('Could not delete plan');
      return;
    }
    setSelectedId(null);
    onChange();
  };

  const duplicateSlot = async (s: PlanSlot) => {
    const { id: _id, ...rest } = s;
    const { error } = await supabase.from('instagram_plan_slots').insert({ ...rest, position: s.position + 1 });
    if (error) toast.error('Could not duplicate slot');
    else onChange();
  };

  const deleteSlot = async (s: PlanSlot) => {
    const ok = await showConfirm({ message: 'Delete this post slot?', variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    const { error } = await supabase.from('instagram_plan_slots').delete().eq('id', s.id);
    if (error) toast.error('Could not delete slot');
    else onChange();
  };

  const planSlots = slots
    .filter((s) => s.plan_id === plan?.id)
    .map((s) => (movedDays[s.id] !== undefined ? { ...s, day_of_week: movedDays[s.id] } : s));

  const endDrag = () => {
    setDragId(null);
    setDropDay(null);
  };

  const moveSlot = async (slotId: string, day: number) => {
    endDrag();
    const s = planSlots.find((x) => x.id === slotId);
    if (!s || s.day_of_week === day) return;
    setMovedDays((m) => ({ ...m, [slotId]: day }));
    const { error } = await supabase.from('instagram_plan_slots').update({ day_of_week: day }).eq('id', slotId);
    if (error) {
      setMovedDays((m) => {
        const { [slotId]: _drop, ...rest } = m;
        return rest;
      });
      toast.error('Could not move post');
      return;
    }
    toast.success(`Moved to ${WEEK_DAYS.find((w) => w.value === day)?.long ?? 'new day'}`);
    onChange();
  };

  const { drag: touchDrag, bind, justDragged } = useTouchDrag(moveSlot);

  if (plans.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
          <LayoutGrid className="w-6 h-6 text-pink-600" />
        </div>
        <p className="font-medium text-gray-900 dark:text-white">Create your first weekly plan</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">A plan is a reusable week: what to post each day, when, which prompt writes the caption, and which accounts it goes to.</p>
        <button onClick={createPlan} className={`${PINK.primary} mt-6`}><Plus className="w-4 h-4" /> New plan</button>
      </div>
    );
  }

  const topicName = (id: string | null) => topics.find((t) => t.id === id)?.name;
  const sampleName = (id: string | null) => samples.find((s) => s.id === id)?.name;
  const promptTitle = (s: PlanSlot) => {
    const text = s.caption_prompt?.trim();
    if (!text) return prompts.find((p) => p.id === s.prompt_id)?.title;
    const source = prompts.find((p) => p.id === s.prompt_id);
    if (source && source.content.trim() === text) return source.title;
    return source ? `${source.title} (edited)` : text.slice(0, 80);
  };
  const touchSlot = touchDrag ? planSlots.find((s) => s.id === touchDrag.id) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${p.id === plan?.id ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {p.name}
            </button>
          ))}
          <button onClick={createPlan} className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-colors">
            <Plus className="w-4 h-4" /> New plan
          </button>
        </div>
        {plan && (
          <div className="flex flex-wrap gap-2">
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
              className={`${PINK.input} text-base font-semibold`}
              placeholder="Plan name"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== plan.description && savePlanField({ description })}
              className={`${PINK.input} md:col-span-2`}
              placeholder="What is this plan for? e.g. Summer product launch"
            />
          </div>

          <AccountsPicker plan={plan} accounts={accounts} onSave={(ids) => savePlanField({ account_ids: ids })} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {WEEK_DAYS.map((d) => {
              const active = plan.active_days.includes(d.value);
              const daySlots = planSlots.filter((s) => s.day_of_week === d.value).sort((a, b) => a.post_time.localeCompare(b.post_time) || a.position - b.position);
              const isDropTarget =
                (dragId !== null && dropDay === d.value) ||
                (touchSlot !== undefined && touchDrag?.overDay === d.value && touchSlot.day_of_week !== d.value);
              return (
                <div
                  key={d.value}
                  data-drop-day={d.value}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dropDay !== d.value) setDropDay(d.value);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropDay((cur) => (cur === d.value ? null : cur));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain') || dragId;
                    if (id) moveSlot(id, d.value);
                  }}
                  className={`flex flex-col rounded-2xl border transition-all duration-150 ${
                    isDropTarget
                      ? 'border-pink-500 ring-2 ring-pink-500/30 bg-pink-50/60 dark:bg-pink-900/10'
                      : active ? 'border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60' : 'border-dashed border-gray-200 dark:border-gray-700 bg-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between px-3 pt-3 pb-2">
                    <span className={`text-sm font-semibold ${active ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{d.long}</span>
                    <button
                      onClick={() => toggleDay(d.value)}
                      role="switch"
                      aria-checked={active}
                      title={active ? 'Posting on this day' : 'Skipping this day'}
                      className={`relative w-9 h-5 rounded-full transition-colors ${active ? 'bg-pink-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : ''}`} />
                    </button>
                  </div>
                  <div className={`flex-1 px-2 pb-2 space-y-2 min-h-[64px] ${active || isDropTarget ? '' : 'opacity-40'}`}>
                    {daySlots.map((s) => (
                      <div
                        key={s.id}
                        draggable={!touchMode}
                        {...bind(s.id)}
                        onPointerDown={(e) => setTouchMode(e.pointerType !== 'mouse')}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', s.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(s.id);
                        }}
                        onDragEnd={endDrag}
                        onClick={() => !justDragged() && setEditor({ slot: s, day: s.day_of_week })}
                        title={touchMode ? undefined : 'Click to edit, drag to move to another day'}
                        className={`group relative cursor-grab active:cursor-grabbing select-none [-webkit-touch-callout:none] rounded-xl border-l-4 border-pink-500 bg-white dark:bg-gray-900 p-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${dragId === s.id || touchDrag?.id === s.id ? 'opacity-40 scale-95' : ''} ${menuOpenId === s.id ? 'z-20' : ''}`}
                      >
                        <div className="flex items-center gap-1 text-xs font-semibold text-gray-900 dark:text-white">
                          <GripVertical className="w-3 h-3 -ml-1 text-gray-300 dark:text-gray-600 group-hover:text-gray-400" />
                          <Clock className="w-3 h-3 text-gray-400" /> {formatTime(s.post_time)}
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-[11px] uppercase tracking-wide font-semibold text-pink-600 dark:text-pink-400">
                          {s.media_type === 'carousel' ? <><Images className="w-3 h-3" /> Carousel x{s.carousel_size}</> : <><ImageIcon className="w-3 h-3" /> Single</>}
                          {s.link_id && <Link2 className="w-3 h-3 ml-auto text-gray-400" aria-label="Has link" />}
                          {s.overlay_mode !== 'none' && <Type className={`w-3 h-3 text-gray-400 ${s.link_id ? '' : 'ml-auto'}`} aria-label={s.overlay_scope === 'all' ? 'Text on every photo' : 'Text on cover photo'} />}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-200 line-clamp-2">{promptTitle(s) || <span className="text-amber-600">No prompt chosen</span>}</p>
                        {topicName(s.topic_id) && <p className="mt-0.5 text-[11px] text-gray-500 truncate">{topicName(s.topic_id)}</p>}
                        {sampleName(s.voice_sample_id) && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400 truncate"><Mic className="w-3 h-3" /> {sampleName(s.voice_sample_id)}</p>
                        )}
                        <div
                          onTouchStart={(e) => e.stopPropagation()}
                          className={`absolute top-1.5 right-1.5 gap-0.5 bg-white dark:bg-gray-900 rounded-md ${menuOpenId === s.id ? 'flex' : 'flex sm:hidden sm:group-hover:flex [@media(hover:none)]:flex'}`}
                        >
                          <MoveDayMenu
                            currentDay={s.day_of_week}
                            onMove={(day) => moveSlot(s.id, day)}
                            onOpenChange={(open) => setMenuOpenId((cur) => (open ? s.id : cur === s.id ? null : cur))}
                          />
                          <button onClick={(e) => { e.stopPropagation(); duplicateSlot(s); }} className="p-1 rounded text-gray-400 hover:text-pink-600" aria-label="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteSlot(s); }} className="p-1 rounded text-gray-400 hover:text-red-600" aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setEditor({ slot: null, day: d.value })}
                      className="w-full flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-500 hover:text-pink-600 hover:border-pink-500 transition-colors"
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

      {touchDrag && touchSlot && (
        <TouchDragOverlay drag={touchDrag} currentDay={touchSlot.day_of_week} time={formatTime(touchSlot.post_time)} label={promptTitle(touchSlot) || 'Post slot'} />
      )}

      {editor && plan && (
        <SlotEditor
          planId={plan.id}
          slot={editor.slot}
          dayOfWeek={editor.day}
          topics={topics}
          samples={samples}
          prompts={prompts}
          imageTextPrompts={imageTextPrompts}
          links={links}
          onClose={() => setEditor(null)}
          onSaved={onChange}
        />
      )}
    </div>
  );
}
