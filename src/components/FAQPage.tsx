import { useState, useEffect, useCallback } from 'react';
import { HelpCircle, Plus, Trash2, Edit2, Save, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface FAQPageProps {
  onSignOut: () => void;
  currentView: string;
}

export function FAQPage({ onSignOut: _onSignOut, currentView: _currentView }: FAQPageProps) {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ question: '', answer: '' });
  const [userId, setUserId] = useState<string | null>(null);

  const fetchFAQs = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setIsLoading(false);
        return;
      }
      setUserId(session.user.id);

      const { data, error } = await supabase
        .from('faqs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setFaqs(data || []);
    } catch (error) {
      console.error('Error fetching FAQs:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFAQs();
  }, [fetchFAQs]);

  const handleSave = async () => {
    if (!formData.question.trim() || !formData.answer.trim()) {
      alert('Please fill in both the question and answer');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('faqs')
          .update({
            question: formData.question.trim(),
            answer: formData.answer.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const maxSort = faqs.length > 0 ? Math.max(...faqs.map(f => f.sort_order)) : -1;
        const { error } = await supabase
          .from('faqs')
          .insert({
            question: formData.question.trim(),
            answer: formData.answer.trim(),
            sort_order: maxSort + 1,
          });

        if (error) throw error;
      }

      await fetchFAQs();
      resetForm();
    } catch (error) {
      console.error('Error saving FAQ:', error);
      alert('Failed to save FAQ. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (faq: FAQ) => {
    setEditingId(faq.id);
    setFormData({ question: faq.question, answer: faq.answer });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this FAQ?')) return;

    try {
      const { error } = await supabase
        .from('faqs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchFAQs();
    } catch (error) {
      console.error('Error deleting FAQ:', error);
      alert('Failed to delete FAQ. Please try again.');
    }
  };

  const handleMove = async (faq: FAQ, direction: 'up' | 'down') => {
    const sorted = [...faqs].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex(f => f.id === faq.id);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sorted.length - 1) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const swapFaq = sorted[swapIndex];

    try {
      await supabase.from('faqs').update({ sort_order: swapFaq.sort_order, updated_at: new Date().toISOString() }).eq('id', faq.id);
      await supabase.from('faqs').update({ sort_order: faq.sort_order, updated_at: new Date().toISOString() }).eq('id', swapFaq.id);
      await fetchFAQs();
    } catch (error) {
      console.error('Error reordering FAQ:', error);
    }
  };

  const resetForm = () => {
    setFormData({ question: '', answer: '' });
    setEditingId(null);
    setShowForm(false);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center overflow-x-hidden">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-white dark:bg-gray-900 min-h-screen overflow-x-hidden">
      <div className="max-w-4xl mx-auto w-full min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">FAQ</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Add frequently asked questions about your business. Use {' '}
                <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-mono">{'{{faq}}'}</code>
                {' '}in any prompt to insert them automatically.
              </p>
            </div>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add FAQ
            </button>
          )}
        </div>

        {showForm && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {editingId ? 'Edit FAQ' : 'New FAQ'}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Question
                </label>
                <input
                  type="text"
                  value={formData.question}
                  onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., What areas do you serve?"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Answer
                </label>
                <textarea
                  value={formData.answer}
                  onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., We serve the greater Houston metropolitan area including all surrounding suburbs."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {editingId ? 'Update' : 'Add'} FAQ
                </button>
              </div>
            </div>
          </div>
        )}

        {faqs.length === 0 && !showForm ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No FAQs yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add frequently asked questions about your business. They'll be available in all your prompts via the {'{{faq}}'} placeholder.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add your first FAQ
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {[...faqs].sort((a, b) => a.sort_order - b.sort_order).map((faq, index) => (
              <div
                key={faq.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white mb-1">
                      {faq.question}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {faq.answer}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleMove(faq, 'up')}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMove(faq, 'down')}
                      disabled={index === faqs.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => handleEdit(faq)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(faq.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {faqs.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>How to use:</strong> Add the placeholder {' '}
              <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-mono">{'{{faq}}'}</code>
              {' '}in any prompt (email auto-replies, Instagram, LinkedIn, Threads, or Instagram image text). When the AI generates content, it will automatically see all your FAQs as context.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
