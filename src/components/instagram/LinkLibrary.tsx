import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Link2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { PINK, isValidLink, type PlanSlot, type SavedLink } from './types';

interface LinkLibraryProps {
  links: SavedLink[];
  slots: PlanSlot[];
  onChange: () => void;
}

export function LinkLibrary({ links, slots, onChange }: LinkLibraryProps) {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const slotUse = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of slots) if (s.link_id) m.set(s.link_id, (m.get(s.link_id) || 0) + 1);
    return m;
  }, [slots]);

  const add = async () => {
    const url = newUrl.trim();
    if (!isValidLink(url)) {
      toast.error('Enter a full web address starting with https://');
      return;
    }
    if (links.some((l) => l.url === url)) {
      toast.error('That link is already saved');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('instagram_links').insert({ name: newName.trim() || url, url });
    setSaving(false);
    if (error) {
      toast.error('Could not save link');
      return;
    }
    setNewName('');
    setNewUrl('');
    onChange();
  };

  const saveEdit = async () => {
    if (!editId) return;
    const url = editUrl.trim();
    if (!isValidLink(url)) {
      toast.error('Enter a full web address starting with https://');
      return;
    }
    const { error } = await supabase
      .from('instagram_links')
      .update({ name: editName.trim() || url, url, updated_at: new Date().toISOString() })
      .eq('id', editId);
    if (error) {
      toast.error('Could not update link');
      return;
    }
    setEditId(null);
    onChange();
  };

  const remove = async (link: SavedLink) => {
    const ok = await showConfirm({
      message: `Delete "${link.name}"? Posts and plan slots using it will go out without a link.`,
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    const { error } = await supabase.from('instagram_links').delete().eq('id', link.id);
    if (error) toast.error('Could not delete link');
    else onChange();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Saved Links</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Save your web links here, then pick one for each post or set a default on a plan slot. Editing a link here updates every post using it that has not been published yet.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (e.g. Spring offer)" className={PINK.input} />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              placeholder="https://yoursite.com/offer"
              className={PINK.input}
            />
            <button onClick={add} disabled={!newUrl.trim() || saving} className={PINK.primary}>
              <Plus className="w-4 h-4" /> Save link
            </button>
          </div>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {links.map((l) => (
            <li key={l.id} className="group px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
              {editId === l.id ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${PINK.input} py-1.5`} autoFocus />
                  <input
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}
                    className={`${PINK.input} py-1.5`}
                  />
                  <div className="flex gap-1">
                    <button onClick={saveEdit} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" aria-label="Save"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cancel"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 flex items-center justify-center">
                    <Link2 className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{l.name}</p>
                    <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-pink-600 truncate max-w-full">
                      <span className="truncate">{l.url}</span> <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                  {slotUse.get(l.id) ? (
                    <span className="hidden sm:inline text-xs text-gray-400">Default on {slotUse.get(l.id)} slot{slotUse.get(l.id) === 1 ? '' : 's'}</span>
                  ) : null}
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditId(l.id); setEditName(l.name); setEditUrl(l.url); }} className="p-1.5 rounded-lg text-gray-500 hover:text-pink-600 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(l)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {links.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-500">No saved links yet. Add your first one above.</li>}
        </ul>
      </div>
    </div>
  );
}
