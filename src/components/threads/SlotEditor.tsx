import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { Modal, labelClass, secondaryBtn } from '../linkedin/Modal';
import { WEEK_DAYS } from '../linkedin/types';
import { InstagramCrossPost } from './AudiencePicker';
import { LinkPicker } from './LinkPicker';
import { PhotoPicker, type PhotoValue } from './PhotoPicker';
import { PromptTextBox } from './PromptTextBox';
import { ReplyCountSelect } from './ThreadReplies';
import { THEME, type PlanSlot, type SavedLink, type ThreadsPrompt, type Topic, type VoiceSample } from './types';

interface Props {
  planId: string;
  slot: PlanSlot | null;
  dayOfWeek: number;
  topics: Topic[];
  samples: VoiceSample[];
  prompts: ThreadsPrompt[];
  links: SavedLink[];
  onClose: () => void;
  onSaved: () => void;
}

export function SlotEditor({ planId, slot, dayOfWeek, topics, samples, prompts, links, onClose, onSaved }: Props) {
  const [time, setTime] = useState(slot?.post_time?.slice(0, 5) || '09:00');
  const [promptId, setPromptId] = useState(slot?.prompt_id || '');
  const [promptText, setPromptText] = useState(slot?.thread_prompt || '');
  const [extra, setExtra] = useState(slot?.extra_instructions || '');
  const [replyCount, setReplyCount] = useState(slot?.reply_count ?? 0);
  const [topicId, setTopicId] = useState(slot?.topic_id || '');
  const [voiceId, setVoiceId] = useState(slot?.voice_sample_id || '');
  const [linkId, setLinkId] = useState(slot?.link_id || '');
  const [photo, setPhoto] = useState<PhotoValue>({
    mode: slot?.photo_mode || 'none',
    count: slot?.photo_count || 1,
    urls: slot?.photo_urls || [],
    assetIds: [],
  });
  const [alsoIg, setAlsoIg] = useState(slot?.also_instagram || false);
  const [saving, setSaving] = useState(false);

  const day = WEEK_DAYS.find((d) => d.value === dayOfWeek)?.long || '';
  const hasPhotos = photo.mode === 'library' || (photo.mode === 'upload' && photo.urls.length > 0);

  const save = async () => {
    if (photo.mode === 'upload' && !photo.urls.length) {
      toast.error('Upload at least one photo, or choose another photo option');
      return;
    }
    setSaving(true);
    const payload = {
      plan_id: planId,
      day_of_week: dayOfWeek,
      post_time: time,
      prompt_id: promptId || null,
      thread_prompt: promptText,
      extra_instructions: extra,
      reply_count: replyCount,
      topic_id: topicId || null,
      voice_sample_id: voiceId || null,
      link_id: linkId || null,
      photo_mode: photo.mode,
      photo_count: photo.mode === 'upload' ? Math.max(1, photo.urls.length) : photo.count,
      photo_urls: photo.mode === 'upload' ? photo.urls : [],
      also_instagram: alsoIg,
    };
    const { error } = slot
      ? await supabase.from('threads_plan_slots').update(payload).eq('id', slot.id)
      : await supabase.from('threads_plan_slots').insert(payload);
    setSaving(false);
    if (error) {
      toast.error('Could not save this post slot');
      return;
    }
    toast.success(slot ? 'Slot updated' : 'Slot added');
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={slot ? 'Edit post slot' : 'Add post slot'}
      subtitle={`${day}. A new Threads post is written for this slot every week.`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button onClick={save} disabled={saving} className={THEME.primary}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={THEME.input} />
          </div>
          <div>
            <label className={labelClass}>Topic</label>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={THEME.input}>
              <option value="">Rotate topics</option>
              {topics.filter((t) => !t.is_hidden || t.id === topicId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Voice</label>
            <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className={THEME.input}>
              <option value="">Any voice</option>
              {samples.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <PromptTextBox
          label="How to write the post"
          value={promptText}
          groups={[{ label: 'Threads prompts', prompts }]}
          placeholder="e.g. Share one quick, practical tip about {{topic}} in a casual tone. End with a question."
          onChange={setPromptText}
          onImport={setPromptId}
        />

        <div>
          <label className={labelClass}>Extra instructions (optional)</label>
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. Keep it under 300 characters" className={THEME.input} />
        </div>

        <ReplyCountSelect
          value={replyCount}
          onChange={setReplyCount}
          label="Thread follow-ups"
          hint="The main post goes out first, then each follow-up is posted as a reply. Auto lets the AI use as many replies as the content needs (up to 10)."
        />

        <div>
          <label className={labelClass}>Link (optional)</label>
          <LinkPicker links={links} value={linkId} onChange={setLinkId} onCreated={onSaved} />
        </div>

        <div>
          <label className={labelClass}>Photos (optional)</label>
          <PhotoPicker value={photo} onChange={setPhoto} variant="slot" />
        </div>

        <InstagramCrossPost enabled={alsoIg} onEnabledChange={setAlsoIg} igAccounts={[]} value={[]} onChange={() => undefined} hasPhotos={hasPhotos} showAccounts={false} />
      </div>
    </Modal>
  );
}
