import { useState } from 'react';
import { Link2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { secondaryBtn } from '../linkedin/Modal';
import { THEME, isValidLink, linkLabel, type SavedLink } from './types';

interface LinkPickerProps {
  links: SavedLink[];
  value: string;
  onChange: (linkId: string) => void;
  onCreated?: () => void;
  disabled?: boolean;
}

const ADD_NEW = '__add_new__';

export function LinkPicker({ links, value, onChange, onCreated, disabled }: LinkPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<SavedLink[]>([]);
  const options = [...links, ...created.filter((c) => !links.some((l) => l.id === c.id))];

  const save = async () => {
    const clean = url.trim();
    if (!isValidLink(clean)) {
      toast.error('Enter a full web address starting with https://');
      return;
    }
    const existing = options.find((l) => l.url === clean);
    if (existing) {
      onChange(existing.id);
      setAdding(false);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('threads_links').insert({ name: name.trim() || clean, url: clean }).select('id, name, url, created_at').maybeSingle();
    setSaving(false);
    if (error || !data) {
      toast.error('Could not save link');
      return;
    }
    setCreated((prev) => [...prev, data as SavedLink]);
    onChange(data.id);
    onCreated?.();
    setAdding(false);
    setName('');
    setUrl('');
  };

  if (adding) {
    return (
      <div className="space-y-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Spring offer)" className={THEME.input} autoFocus />
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder="https://yoursite.com/offer" className={THEME.input} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>Cancel</button>
          <button type="button" onClick={save} disabled={saving || !url.trim()} className={THEME.primary}><Plus className="w-4 h-4" /> Save link</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => { if (e.target.value === ADD_NEW) setAdding(true); else onChange(e.target.value); }}
        className={`${THEME.input} pl-9 disabled:opacity-60`}
      >
        <option value="">No link</option>
        {options.map((l) => <option key={l.id} value={l.id}>{linkLabel(l)}</option>)}
        <option value={ADD_NEW}>+ Save a new link...</option>
      </select>
    </div>
  );
}
