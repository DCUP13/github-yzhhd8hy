import { useState } from 'react';
import { Plus, Pencil, Eye, EyeOff, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { PINK, type Topic } from './types';

interface TopicLibraryProps {
  topics: Topic[];
  onChange: () => void;
}

export function TopicLibrary({ topics, onChange }: TopicLibraryProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const list = topics.filter((t) => showHidden || !t.is_hidden);
  const hiddenCount = topics.filter((t) => t.is_hidden).length;

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    if (topics.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error('That topic already exists');
      return;
    }
    const maxOrder = Math.max(0, ...topics.map((t) => t.sort_order));
    const { error } = await supabase.from('instagram_topics').insert({ name, sort_order: maxOrder + 1 });
    if (error) {
      toast.error('Could not add topic');
      return;
    }
    setNewName('');
    onChange();
  };

  const saveEdit = async () => {
    if (!editId || !editName.trim()) return;
    const { error } = await supabase.from('instagram_topics').update({ name: editName.trim() }).eq('id', editId);
    if (error) toast.error('Could not rename topic');
    setEditId(null);
    onChange();
  };

  const toggleHidden = async (t: Topic) => {
    const { error } = await supabase.from('instagram_topics').update({ is_hidden: !t.is_hidden }).eq('id', t.id);
    if (error) toast.error('Could not update topic');
    else onChange();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Topic Library</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">These fill the topic dropdowns in your plan slots. Hidden topics stay on existing posts but disappear from the dropdowns.</p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 space-y-3">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              placeholder="Add a topic..."
              className={PINK.input}
            />
            <button onClick={add} disabled={!newName.trim()} className={PINK.primary}>
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          {hiddenCount > 0 && (
            <button onClick={() => setShowHidden(!showHidden)} className="text-xs font-medium text-pink-600 hover:underline">
              {showHidden ? 'Hide' : 'Show'} {hiddenCount} hidden
            </button>
          )}
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {list.map((t, i) => (
            <li key={t.id} className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors ${t.is_hidden ? 'opacity-50' : ''}`}>
              <span className="w-6 text-xs tabular-nums text-gray-400">{i + 1}</span>
              {editId === t.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}
                    className={`${PINK.input} py-1`}
                    autoFocus
                  />
                  <button onClick={saveEdit} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" aria-label="Save"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cancel"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">{t.name}</span>
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditId(t.id); setEditName(t.name); }} className="p-1.5 rounded-lg text-gray-500 hover:text-pink-600 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Rename">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleHidden(t)} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label={t.is_hidden ? 'Show' : 'Hide'}>
                      {t.is_hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
          {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-500">No topics yet.</li>}
        </ul>
      </div>
    </div>
  );
}
