import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Pencil, GripVertical, Anchor, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { showConfirm } from '../lib/confirm';

interface Hook {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Hook | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const fetchHooks = useCallback(async () => {
    const { data, error } = await supabase
      .from('hooks')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Could not load hooks');
      return;
    }
    setHooks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchHooks(); }, [fetchHooks]);

  const openNew = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setShowEditor(true);
  };

  const openEdit = (hook: Hook) => {
    setEditing(hook);
    setTitle(hook.title);
    setContent(hook.content);
    setShowEditor(true);
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Add both a title and hook text');
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from('hooks')
        .update({ title: title.trim(), content: content.trim(), updated_at: new Date().toISOString() })
        .eq('id', editing.id);
      if (error) toast.error('Could not save hook');
      else toast.success('Hook updated');
    } else {
      const maxSort = hooks.length > 0 ? Math.max(...hooks.map(h => h.sort_order)) : 0;
      const { error } = await supabase
        .from('hooks')
        .insert({ title: title.trim(), content: content.trim(), sort_order: maxSort + 1 });
      if (error) toast.error('Could not create hook');
      else toast.success('Hook created');
    }
    setSaving(false);
    setShowEditor(false);
    fetchHooks();
  };

  const remove = async (hook: Hook) => {
    const ok = await showConfirm({ message: `Delete "${hook.title}"?`, confirmText: 'Delete' });
    if (!ok) return;
    const { error } = await supabase.from('hooks').delete().eq('id', hook.id);
    if (error) toast.error('Could not delete hook');
    else { toast.success('Hook deleted'); fetchHooks(); }
  };

  const filtered = hooks.filter(h =>
    !search || h.title.toLowerCase().includes(search.toLowerCase()) || h.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Anchor className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hooks</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Reusable opening lines for your social media prompts. Insert with{' '}
                <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs">{'{{hooks}}'}</code>{' '}
                for all hooks or{' '}
                <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs">{'{{hooks:Name}}'}</code>{' '}
                for a specific one.
              </p>
            </div>
          </div>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New hook
          </button>
        </div>

        {hooks.length > 0 && (
          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hooks..."
              className="w-full px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Anchor className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-1">
              {hooks.length === 0 ? 'No hooks yet.' : 'No hooks match your search.'}
            </p>
            {hooks.length === 0 && (
              <p className="text-sm text-gray-400">
                Create hooks like "Contrarian take", "Personal story", or "Bold question" and insert them into any prompt.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((hook) => (
              <div
                key={hook.id}
                className="group flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{hook.title}</h3>
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
                      {'{{hooks:' + hook.title + '}}'}
                    </code>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap line-clamp-3">{hook.content}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(hook)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(hook)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">How to use hooks in prompts</h3>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>{'{{hooks}}'}</strong> — Inserts all your hooks into the prompt so the AI can choose the best one.
            </p>
            <p>
              <strong>{'{{hooks:Hook Name}}'}</strong> — Inserts just that one hook. Use the dropdown in any prompt editor to pick the right one.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 pt-1">
              Hooks work across Instagram, LinkedIn, and Threads. They're replaced when the AI generates your posts.
            </p>
          </div>
        </div>
      </div>

      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowEditor(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {editing ? 'Edit hook' : 'New hook'}
              </h2>
              <button onClick={() => setShowEditor(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Contrarian take"
                  autoFocus
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {title.trim() && (
                  <p className="mt-1 text-xs text-gray-400">
                    Insert in prompts as: <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{'{{hooks:' + title.trim() + '}}'}</code>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hook text</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  placeholder="e.g. Start with a bold, contrarian statement that challenges conventional wisdom about {{topic}}..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowEditor(false)} className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40">
                {saving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
