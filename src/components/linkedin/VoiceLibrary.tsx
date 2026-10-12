import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Mic, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { Modal, inputClass, labelClass, primaryBtn, secondaryBtn } from './Modal';
import type { VoiceSample } from './types';

interface VoiceLibraryProps {
  samples: VoiceSample[];
  onChange: () => void;
}

export function VoiceLibrary({ samples, onChange }: VoiceLibraryProps) {
  const [editing, setEditing] = useState<VoiceSample | 'new' | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const open = (s: VoiceSample | 'new') => {
    setEditing(s);
    setName(s === 'new' ? '' : s.name);
    setContent(s === 'new' ? '' : s.content);
  };

  const save = async () => {
    if (!name.trim() || !content.trim()) {
      toast.error('Give the sample a name and paste the post text');
      return;
    }
    if (samples.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase() && (editing === 'new' || s.id !== editing?.id))) {
      toast.error('Another sample already uses that name');
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), content: content.trim(), updated_at: new Date().toISOString() };
    const { error } = editing === 'new'
      ? await supabase.from('linkedin_voice_samples').insert(payload)
      : await supabase.from('linkedin_voice_samples').update(payload).eq('id', (editing as VoiceSample).id);
    setSaving(false);
    if (error) {
      toast.error('Could not save the sample');
      return;
    }
    toast.success('Voice sample saved');
    setEditing(null);
    onChange();
  };

  const remove = async (s: VoiceSample) => {
    const ok = await showConfirm({ message: `Delete "${s.name}"? Slots using it will fall back to a default voice.`, variant: 'danger', confirmText: 'Delete' });
    if (!ok) return;
    const { error } = await supabase.from('linkedin_voice_samples').delete().eq('id', s.id);
    if (error) toast.error('Could not delete the sample');
    else onChange();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Voice Library</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
            Paste posts that sound exactly like you. Each prompt slot picks one as its voice, and you can drop any sample's text straight into a prompt.
          </p>
        </div>
        <button onClick={() => open('new')} className={primaryBtn}>
          <Plus className="w-4 h-4" /> Add sample
        </button>
      </div>

      {samples.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#0A66C2]/10 flex items-center justify-center">
            <Mic className="w-6 h-6 text-[#0A66C2]" />
          </div>
          <p className="font-medium text-gray-900 dark:text-white">No voice samples yet</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add 2-3 of your best posts so every generated post sounds like you.</p>
          <button onClick={() => open('new')} className={`${primaryBtn} mt-6`}>
            <Plus className="w-4 h-4" /> Add your first sample
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {samples.map((s) => (
            <div key={s.id} className="group flex flex-col rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{s.name}</h3>
                <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => open(s)} className="p-1.5 rounded-lg text-gray-500 hover:text-[#0A66C2] hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(s)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-line line-clamp-6 flex-1">{s.content}</p>
              <p className="mt-4 text-xs text-gray-400">{s.content.split(/\s+/).filter(Boolean).length} words</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add voice sample' : 'Edit voice sample'}
          subtitle="The AI copies tone, rhythm and formatting, never the content itself."
          size="lg"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button onClick={() => setEditing(null)} className={secondaryBtn}>Cancel</button>
              <button onClick={save} disabled={saving} className={primaryBtn}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save sample
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Story-driven lesson" className={inputClass} autoFocus />
            </div>
            <div>
              <label className={labelClass}>Post text</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={14} placeholder="Paste a full LinkedIn post you wrote..." className={`${inputClass} leading-relaxed`} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
