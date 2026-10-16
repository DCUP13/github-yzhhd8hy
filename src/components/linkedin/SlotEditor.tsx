import React, { useRef, useState } from 'react';
import { Loader2, Plus, Upload, FileText, Sparkles, Ban, Quote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { uploadFile } from './api';
import { Modal, inputClass, labelClass, primaryBtn, secondaryBtn } from './Modal';
import { CATEGORIES, CATEGORY_STYLES, GUIDE_LENGTHS, WEEK_DAYS, type Category, type GuideLength, type GuideMode, type PlanSlot, type Topic, type VoiceSample } from './types';

interface SlotEditorProps {
  planId: string;
  slot: PlanSlot | null;
  dayOfWeek: number;
  topics: Topic[];
  samples: VoiceSample[];
  onClose: () => void;
  onSaved: () => void;
}

const ADD_NEW = '__add_new__';

export function SlotEditor({ planId, slot, dayOfWeek, topics, samples, onClose, onSaved }: SlotEditorProps) {
  const [postTime, setPostTime] = useState((slot?.post_time || '09:00').slice(0, 5));
  const [category, setCategory] = useState<Category>(slot?.category || 'mindset');
  const [topicId, setTopicId] = useState<string>(slot?.topic_id || '');
  const [sampleId, setSampleId] = useState<string>(slot?.voice_sample_id || '');
  const [prompt, setPrompt] = useState(slot?.prompt || '');
  const [guideMode, setGuideMode] = useState<GuideMode>(slot?.guide_mode || 'none');
  const [guideLength, setGuideLength] = useState<GuideLength>(slot?.guide_length || 'medium');
  const [guidePrompt, setGuidePrompt] = useState(slot?.guide_prompt || '');
  const [docUrl, setDocUrl] = useState(slot?.upload_document_url || '');
  const [docName, setDocName] = useState(slot?.upload_document_name || '');
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const guideRef = useRef<HTMLTextAreaElement>(null);

  const topicOptions = topics.filter((t) => t.category === category && (!t.is_hidden || t.id === topicId));
  const dayLabel = WEEK_DAYS.find((d) => d.value === dayOfWeek)?.long;

  const changeCategory = (c: Category) => {
    setCategory(c);
    setTopicId('');
    if (c === 'research' && guideMode === 'upload') setGuideMode('none');
  };

  const insertToken = (target: 'prompt' | 'guide', token: string) => {
    const ref = target === 'prompt' ? promptRef.current : guideRef.current;
    const value = target === 'prompt' ? prompt : guidePrompt;
    const set = target === 'prompt' ? setPrompt : setGuidePrompt;
    const start = ref?.selectionStart ?? value.length;
    const end = ref?.selectionEnd ?? value.length;
    set(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      ref?.focus();
      ref?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const addTopic = async () => {
    const name = newTopic.trim();
    if (!name) return;
    const { data, error } = await supabase.from('linkedin_topics').insert({ category, name, sort_order: 999 }).select('id').maybeSingle();
    if (error || !data) {
      toast.error('Could not add topic');
      return;
    }
    setTopicId(data.id);
    setAddingTopic(false);
    setNewTopic('');
    onSaved();
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadFile(file, 'linkedin/documents');
      setDocUrl(res.url);
      setDocName(file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (guideMode === 'upload' && !docUrl) {
      toast.error('Upload a document or choose a different document option');
      return;
    }
    setSaving(true);
    const payload = {
      plan_id: planId,
      day_of_week: dayOfWeek,
      post_time: postTime,
      category,
      topic_id: topicId || null,
      voice_sample_id: sampleId || null,
      prompt,
      guide_mode: guideMode,
      guide_length: guideLength,
      guide_prompt: guidePrompt,
      upload_document_url: guideMode === 'upload' ? docUrl : null,
      upload_document_name: guideMode === 'upload' ? docName : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = slot
      ? await supabase.from('linkedin_plan_slots').update(payload).eq('id', slot.id)
      : await supabase.from('linkedin_plan_slots').insert(payload);
    setSaving(false);
    if (error) {
      toast.error('Could not save this slot');
      return;
    }
    onSaved();
    onClose();
  };

  const SampleChips = ({ target }: { target: 'prompt' | 'guide' }) => (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="text-xs text-gray-400 mr-1">Insert:</span>
      <button type="button" onClick={() => insertToken(target, '{{topic}}')} className="px-2 py-0.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
        Topic
      </button>
      {samples.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => insertToken(target, `{{sample:${s.name}}}`)}
          title={s.content.slice(0, 200)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-[#0A66C2]/10 text-[#0A66C2] dark:text-sky-300 hover:bg-[#0A66C2]/20 transition-colors"
        >
          <Quote className="w-3 h-3" /> {s.name}
        </button>
      ))}
      {samples.length === 0 && <span className="text-xs text-gray-400">Add voice samples to insert their text here</span>}
    </div>
  );

  const docOptions: { value: GuideMode; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { value: 'none', label: 'No document', icon: <Ban className="w-4 h-4" /> },
    { value: 'ai', label: 'AI guide (PDF)', icon: <Sparkles className="w-4 h-4" /> },
    { value: 'upload', label: 'Upload file', icon: <Upload className="w-4 h-4" />, disabled: category === 'research' },
  ];

  return (
    <Modal
      title={slot ? 'Edit post slot' : 'New post slot'}
      subtitle={`${dayLabel}s - applies every week this plan is active`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>Cancel</button>
          <button onClick={save} disabled={saving || uploading} className={primaryBtn}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save slot
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div>
            <label className={labelClass}>Post time</label>
            <input type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => changeCategory(c.value)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-lg border transition-all ${category === c.value ? CATEGORY_STYLES[c.value].chip + ' ring-2 ring-offset-1 ring-current/20' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${CATEGORY_STYLES[c.value].dot}`} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>{category === 'research' ? 'Research topic' : 'Topic'}</label>
            {addingTopic ? (
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); }} placeholder="New topic name" className={inputClass} autoFocus />
                <button type="button" onClick={addTopic} className={primaryBtn}><Plus className="w-4 h-4" /></button>
                <button type="button" onClick={() => setAddingTopic(false)} className={secondaryBtn}>Cancel</button>
              </div>
            ) : (
              <select
                value={topicId}
                onChange={(e) => { if (e.target.value === ADD_NEW) setAddingTopic(true); else setTopicId(e.target.value); }}
                className={inputClass}
              >
                <option value="">Select a topic...</option>
                {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value={ADD_NEW}>+ Add new topic...</option>
              </select>
            )}
            {category === 'research' && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">The AI uses this topic and your prompt to choose Reddit communities, then searches both the exact words and related phrases.</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Voice</label>
            <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} className={inputClass}>
              <option value="">Default voice</option>
              {samples.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-5">
          <div>
            <label className={labelClass}>Writing prompt</label>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={7}
              placeholder="How should this post be written? e.g. Open with a contrarian hook, share one personal story, end with a question. Structure it like {{sample:My best post}}."
              className={`${inputClass} leading-relaxed`}
            />
            <SampleChips target="prompt" />
          </div>

          <div>
            <label className={labelClass}>Attached document</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {docOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => setGuideMode(o.value)}
                  title={o.disabled ? 'Research posts can only attach AI guides' : undefined}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${guideMode === o.value ? 'border-[#0A66C2] bg-[#0A66C2]/5 text-[#0A66C2] dark:text-sky-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
          </div>

          {guideMode === 'ai' && (
            <div className="space-y-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 p-4">
              <div>
                <label className={labelClass}>Guide length</label>
                <select value={guideLength} onChange={(e) => setGuideLength(e.target.value as GuideLength)} className={inputClass}>
                  {GUIDE_LENGTHS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Guide structure prompt</label>
                <textarea
                  ref={guideRef}
                  value={guidePrompt}
                  onChange={(e) => setGuidePrompt(e.target.value)}
                  rows={5}
                  placeholder="e.g. Start with the core problem, then a 5-step framework with an example for each step, then common mistakes, then a checklist."
                  className={`${inputClass} leading-relaxed`}
                />
                <SampleChips target="guide" />
              </div>
            </div>
          )}

          {guideMode === 'upload' && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-4">
              {docUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                  <FileText className="w-8 h-8 text-[#0A66C2]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{docName || 'Document'}</p>
                    <a href={docUrl} target="_blank" rel="noreferrer" className="text-xs text-[#0A66C2] hover:underline">Preview</a>
                  </div>
                  <label className={`${secondaryBtn} cursor-pointer`}>
                    Replace
                    <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-[#0A66C2] transition-colors">
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin text-[#0A66C2]" /> : <Upload className="w-6 h-6 text-gray-400" />}
                  <span className="text-sm text-gray-600 dark:text-gray-300">{uploading ? 'Uploading...' : 'Choose a PDF, Word or PowerPoint file'}</span>
                  <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                </label>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This file is attached to every post generated from this slot.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
