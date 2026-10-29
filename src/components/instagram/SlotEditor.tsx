import { useRef, useState } from 'react';
import { Loader2, Plus, Mic, Image as ImageIcon, Images, Ban, Sparkles, Type } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { Modal, labelClass, secondaryBtn } from '../linkedin/Modal';
import { WEEK_DAYS } from '../linkedin/types';
import { PINK, type InstagramPrompt, type MediaType, type OverlayMode, type PlanSlot, type SavedLink, type Topic, type VoiceSample } from './types';
import { LinkPicker } from './LinkPicker';

interface SlotEditorProps {
  planId: string;
  slot: PlanSlot | null;
  dayOfWeek: number;
  topics: Topic[];
  samples: VoiceSample[];
  prompts: InstagramPrompt[];
  links: SavedLink[];
  onClose: () => void;
  onSaved: () => void;
}

const ADD_NEW = '__add_new__';

function choiceClass(active: boolean) {
  return `flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-lg border transition-all ${
    active
      ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300'
      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
  }`;
}

export function SlotEditor({ planId, slot, dayOfWeek, topics, samples, prompts, links, onClose, onSaved }: SlotEditorProps) {
  const [postTime, setPostTime] = useState((slot?.post_time || '09:00').slice(0, 5));
  const [promptId, setPromptId] = useState(slot?.prompt_id || '');
  const [extra, setExtra] = useState(slot?.extra_instructions || '');
  const [topicId, setTopicId] = useState(slot?.topic_id || '');
  const [sampleId, setSampleId] = useState(slot?.voice_sample_id || '');
  const [mediaType, setMediaType] = useState<MediaType>(slot?.media_type || 'single');
  const [carouselSize, setCarouselSize] = useState(slot?.carousel_size || 3);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(slot?.overlay_mode || 'none');
  const [overlayText, setOverlayText] = useState(slot?.overlay_text || '');
  const [linkId, setLinkId] = useState(slot?.link_id || '');
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [saving, setSaving] = useState(false);
  const extraRef = useRef<HTMLTextAreaElement>(null);

  const topicOptions = topics.filter((t) => !t.is_hidden || t.id === topicId);
  const selectedPrompt = prompts.find((p) => p.id === promptId);
  const dayLabel = WEEK_DAYS.find((d) => d.value === dayOfWeek)?.long;

  const insertToken = (token: string) => {
    const el = extraRef.current;
    const start = el?.selectionStart ?? extra.length;
    const end = el?.selectionEnd ?? extra.length;
    setExtra(extra.slice(0, start) + token + extra.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const addTopic = async () => {
    const name = newTopic.trim();
    if (!name) return;
    const { data, error } = await supabase.from('instagram_topics').insert({ name, sort_order: 999 }).select('id').maybeSingle();
    if (error || !data) {
      toast.error('Could not add topic');
      return;
    }
    setTopicId(data.id);
    setAddingTopic(false);
    setNewTopic('');
    onSaved();
  };

  const save = async () => {
    if (!promptId) {
      toast.error('Choose a caption prompt');
      return;
    }
    if (overlayMode === 'fixed' && !overlayText.trim()) {
      toast.error('Enter the overlay text or choose a different overlay option');
      return;
    }
    setSaving(true);
    const payload = {
      plan_id: planId,
      day_of_week: dayOfWeek,
      post_time: postTime,
      prompt_id: promptId,
      extra_instructions: extra,
      topic_id: topicId || null,
      voice_sample_id: sampleId || null,
      media_type: mediaType,
      carousel_size: mediaType === 'carousel' ? carouselSize : 3,
      overlay_mode: overlayMode,
      overlay_text: overlayMode === 'fixed' ? overlayText.trim() : '',
      link_id: linkId || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = slot
      ? await supabase.from('instagram_plan_slots').update(payload).eq('id', slot.id)
      : await supabase.from('instagram_plan_slots').insert(payload);
    if (error) {
      setSaving(false);
      toast.error('Could not save this slot');
      return;
    }
    const oldLink = slot?.link_id || null;
    if (slot && oldLink !== (linkId || null)) {
      const q = supabase
        .from('instagram_scheduled_posts')
        .update({ link_id: linkId || null })
        .eq('slot_id', slot.id)
        .not('status', 'in', '(publishing,published,partial)');
      const { error: postErr } = await (oldLink ? q.eq('link_id', oldLink) : q.is('link_id', null));
      if (postErr) toast.error('Slot saved, but upcoming posts could not be updated to the new link');
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={slot ? 'Edit post slot' : 'New post slot'}
      subtitle={`${dayLabel}s - applies every week this plan is active`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button onClick={save} disabled={saving} className={PINK.primary}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save slot
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div>
            <label className={labelClass}>Post time</label>
            <input type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)} className={PINK.input} />
          </div>

          <div>
            <label className={labelClass}>Topic</label>
            {addingTopic ? (
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); }} placeholder="New topic name" className={PINK.input} autoFocus />
                <button type="button" onClick={addTopic} className={PINK.primary} aria-label="Add topic"><Plus className="w-4 h-4" /></button>
                <button type="button" onClick={() => setAddingTopic(false)} className={secondaryBtn}>Cancel</button>
              </div>
            ) : (
              <select
                value={topicId}
                onChange={(e) => { if (e.target.value === ADD_NEW) setAddingTopic(true); else setTopicId(e.target.value); }}
                className={PINK.input}
              >
                <option value="">No specific topic</option>
                {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value={ADD_NEW}>+ Add new topic...</option>
              </select>
            )}
          </div>

          <div>
            <label className={labelClass}>Voice</label>
            <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} className={PINK.input}>
              <option value="">Default voice</option>
              {samples.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Post format</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMediaType('single')} className={choiceClass(mediaType === 'single')}><ImageIcon className="w-4 h-4" /> Single photo</button>
              <button type="button" onClick={() => setMediaType('carousel')} className={choiceClass(mediaType === 'carousel')}><Images className="w-4 h-4" /> Carousel</button>
            </div>
            {mediaType === 'carousel' && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-300">Photos per post</span>
                <input type="range" min={2} max={10} value={carouselSize} onChange={(e) => setCarouselSize(Number(e.target.value))} className="flex-1 accent-pink-600" />
                <span className="w-6 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{carouselSize}</span>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Photos are picked automatically from your Content Library, avoiding ones used recently.</p>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-5">
          <div>
            <label className={labelClass}>Caption prompt</label>
            {prompts.length === 0 ? (
              <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                You have no Instagram prompts yet. Create one on the Prompts page and set its category to Instagram, then come back here.
              </p>
            ) : (
              <>
                <select value={promptId} onChange={(e) => setPromptId(e.target.value)} className={PINK.input}>
                  <option value="">Choose a prompt...</option>
                  {prompts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                {selectedPrompt && (
                  <p className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-line">{selectedPrompt.content}</p>
                )}
              </>
            )}
          </div>

          <div>
            <label className={labelClass}>Extra instructions (optional)</label>
            <textarea
              ref={extraRef}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={3}
              placeholder="e.g. Keep it under 80 words and end with a question about {{topic}}."
              className={`${PINK.input} leading-relaxed`}
            />
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-xs text-gray-400 mr-1">Insert:</span>
              <button type="button" onClick={() => insertToken('{{topic}}')} className="px-2 py-0.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Topic</button>
              <button type="button" onClick={() => insertToken('{{voice}}')} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 transition-colors"><Mic className="w-3 h-3" /> Voice</button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Text on the first photo</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setOverlayMode('none')} className={choiceClass(overlayMode === 'none')}><Ban className="w-4 h-4" /> None</button>
              <button type="button" onClick={() => setOverlayMode('ai')} className={choiceClass(overlayMode === 'ai')}><Sparkles className="w-4 h-4" /> AI writes it</button>
              <button type="button" onClick={() => setOverlayMode('fixed')} className={choiceClass(overlayMode === 'fixed')}><Type className="w-4 h-4" /> Fixed text</button>
            </div>
            {overlayMode === 'fixed' && (
              <input value={overlayText} onChange={(e) => setOverlayText(e.target.value)} maxLength={120} placeholder="e.g. New this week" className={`${PINK.input} mt-2`} />
            )}
            {overlayMode === 'ai' && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">A short headline is written with each caption. You can edit it on any post.</p>}
          </div>

          <div>
            <label className={labelClass}>Default link (optional)</label>
            <LinkPicker links={links} value={linkId} onChange={setLinkId} onCreated={onSaved} />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              New posts from this slot start with this link, added after the caption. You can pick a different saved link on any single post. Instagram shows links in captions as plain text.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
