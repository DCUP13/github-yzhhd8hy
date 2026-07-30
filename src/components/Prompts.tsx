import React, { useState, useEffect } from 'react';
import { FileText, Plus, CreditCard as Edit, Trash2, Search, Info, Repeat, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PromptsProps {
  onSignOut: () => void;
  currentView: string;
}

interface Prompt {
  id: string;
  title: string;
  category: string;
  content: string;
  variables: string[];
  reply_mode: 'single' | 'two_step';
  step1_content: string | null;
  step2_content: string | null;
  business_data: string | null;
  use_business_data: boolean;
  created_at: string;
  updated_at: string;
}

const categories = [
  'General',
  'Email Marketing',
  'Real Estate',
  'Customer Service',
  'Sales',
  'Follow-up',
  'Other'
];

export function Prompts({ onSignOut, currentView }: PromptsProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    category: 'General',
    content: '',
    variables: '',
    replyMode: 'single' as 'single' | 'two_step',
    step1Content: '',
    step2Content: '',
    businessData: '',
    useBusinessData: false,
  });

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setPrompts(data || []);
    } catch (error) {
      console.error('Error fetching prompts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this prompt?')) return;

    try {
      const { error } = await supabase
        .from('prompts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchPrompts();
    } catch (error) {
      console.error('Error deleting prompt:', error);
      alert('Failed to delete prompt. Please try again.');
    }
  };

  const handleEditPrompt = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setFormData({
      title: prompt.title,
      category: prompt.category,
      content: prompt.content || '',
      variables: (prompt.variables ?? []).join(', '),
      replyMode: prompt.reply_mode || 'single',
      step1Content: prompt.step1_content || '',
      step2Content: prompt.step2_content || '',
      businessData: prompt.business_data || '',
      useBusinessData: prompt.use_business_data || false,
    });
    setShowCreateModal(true);
  };

  const filteredPrompts = prompts.filter(prompt =>
    prompt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (prompt.content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (prompt.step1_content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    prompt.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetForm = () => {
    setFormData({
      title: '',
      category: 'General',
      content: '',
      variables: '',
      replyMode: 'single',
      step1Content: '',
      step2Content: '',
      businessData: '',
      useBusinessData: false,
    });
    setShowCreateModal(false);
    setEditingPrompt(null);
  };

  const handleSavePrompt = async () => {
    const hasContent = formData.replyMode === 'two_step'
      ? (formData.step1Content && formData.step2Content)
      : formData.content;

    if (!formData.title || !hasContent) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('User not authenticated');
      }

      const variables = formData.variables
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

      const promptData: Record<string, any> = {
        title: formData.title,
        category: formData.category,
        variables: variables,
        user_id: session.user.id,
        updated_at: new Date().toISOString(),
        reply_mode: formData.replyMode,
        use_business_data: formData.useBusinessData,
        business_data: formData.useBusinessData ? formData.businessData : null,
      };

      if (formData.replyMode === 'two_step') {
        promptData.step1_content = formData.step1Content;
        promptData.step2_content = formData.step2Content;
        promptData.content = null;
      } else {
        promptData.content = formData.content;
        promptData.step1_content = null;
        promptData.step2_content = null;
      }

      if (editingPrompt) {
        const { error } = await supabase
          .from('prompts')
          .update(promptData)
          .eq('id', editingPrompt.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('prompts')
          .insert(promptData);

        if (error) throw error;
      }

      await fetchPrompts();
      resetForm();
      alert(editingPrompt ? 'Prompt updated successfully!' : 'Prompt created successfully!');
    } catch (error) {
      console.error('Error saving prompt:', error);
      alert('Failed to save prompt. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Prompts</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowInfoDialog(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Info className="w-4 h-4 mr-2" />
              How it works
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Prompt
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPrompts.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {searchQuery ? 'No prompts found' : 'No prompts yet'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Try adjusting your search' : 'Create your first prompt to get started'}
              </p>
            </div>
          ) : (
            filteredPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        {prompt.title}
                      </h3>
                      {prompt.reply_mode === 'two_step' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                          <Repeat className="w-3 h-3" />
                          2-Step
                        </span>
                      )}
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {prompt.category}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEditPrompt(prompt)}
                      className="p-2 text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                      title="Edit prompt"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePrompt(prompt.id)}
                      className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                      title="Delete prompt"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-3">
                  {prompt.reply_mode === 'two_step'
                    ? prompt.step1_content || prompt.step2_content
                    : prompt.content}
                </p>

                {prompt.use_business_data && (
                  <div className="flex items-center gap-1 mb-2">
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      Business data attached
                    </span>
                  </div>
                )}

                {(prompt.variables ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(prompt.variables ?? []).slice(0, 3).map((variable, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                    {(prompt.variables ?? []).length > 3 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-500 dark:text-gray-400">
                        +{(prompt.variables ?? []).length - 3} more
                      </span>
                    )}
                  </div>
                )}

                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Updated {new Date(prompt.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {editingPrompt ? 'Edit Prompt' : 'Create Prompt'}
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., Welcome Email Response"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                {/* Reply Mode Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Reply Mode
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, replyMode: 'single' }))}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        formData.replyMode === 'single'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      Single Step
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, replyMode: 'two_step' }))}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        formData.replyMode === 'two_step'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      Two Step
                    </button>
                  </div>
                </div>

                {formData.replyMode === 'single' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Prompt Content
                    </label>
                    <textarea
                      value={formData.content}
                      onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      rows={8}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                      placeholder="Write your autoresponder prompt here. Use {{variable_name}} for dynamic content."
                      required
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Step 1 — First AI Call
                      </label>
                      <textarea
                        value={formData.step1Content}
                        onChange={(e) => setFormData(prev => ({ ...prev, step1Content: e.target.value }))}
                        rows={6}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                        placeholder="Write the Step 1 prompt here. Specify the output format — this result will be inserted into Step 2."
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        The full output of this step is inserted into Step 2 at the <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">{`{{step1_result}}`}</code> placeholder.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Step 2 — Second AI Call
                      </label>
                      <textarea
                        value={formData.step2Content}
                        onChange={(e) => setFormData(prev => ({ ...prev, step2Content: e.target.value }))}
                        rows={6}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                        placeholder="Write the Step 2 prompt here. Use {{step1_result}} where you want Step 1's output inserted."
                        required
                      />
                    </div>
                  </>
                )}

                {/* Business Data Section */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Business Data
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, useBusinessData: !prev.useBusinessData }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.useBusinessData ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.useBusinessData ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  {formData.useBusinessData && (
                    <>
                      <textarea
                        value={formData.businessData}
                        onChange={(e) => setFormData(prev => ({ ...prev, businessData: e.target.value }))}
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="Enter your business/offer details here. Use {{business_data}} in either step to feed this to the AI."
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Paste your company info, pricing, offers, or any context once here. Then drop the <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">{`{{business_data}}`}</code> placeholder into either prompt step to inject it.
                      </p>
                    </>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Available placeholders:</strong> {`{{step1_result}}`} (Step 2 only), {`{{business_data}}`}, {`{{email}}`} (incoming email), {`{{conversation}}`} (full thread), plus your custom variables.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Custom Variables (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.variables}
                    onChange={(e) => setFormData(prev => ({ ...prev, variables: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., recipient_name, sender_name, subject"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    List any extra variables you use in your prompt, separated by commas
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 p-6 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  {editingPrompt ? 'Update Prompt' : 'Create Prompt'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showInfoDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    How Two-Step Prompts & Placeholders Work
                  </h3>
                </div>
                <button
                  onClick={() => setShowInfoDialog(false)}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 text-sm text-gray-700 dark:text-gray-300">
                <div>
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Single Step vs Two Step</h4>
                  <p>
                    A <strong>Single Step</strong> prompt is one AI call — the AI reads your prompt and returns the reply directly. This is the simple, default mode.
                  </p>
                  <p className="mt-2">
                    A <strong>Two Step</strong> prompt chains two AI calls together. Step 1 runs first (for example, to analyze the incoming email or draft an outline in a specific format). The <em>full</em> output of Step 1 is then inserted into Step 2 at the <code className="px-1 bg-gray-100 dark:bg-gray-700 rounded">{`{{step1_result}}`}</code> placeholder. Step 2 uses that result to produce the final reply. This lets you control the intermediate reasoning separately from the final writing.
                  </p>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Placeholders</h4>
                  <ul className="space-y-2">
                    <li>
                      <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-blue-600 dark:text-blue-400">{`{{step1_result}}`}</code>
                      <span className="ml-2">— Step 1's complete output, inserted verbatim into Step 2. Only available in two-step mode.</span>
                    </li>
                    <li>
                      <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-blue-600 dark:text-blue-400">{`{{business_data}}`}</code>
                      <span className="ml-2">— Your business/offer details from the Business Data section. Can be used in either step when business data is enabled.</span>
                    </li>
                    <li>
                      <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-blue-600 dark:text-blue-400">{`{{email}}`}</code>
                      <span className="ml-2">— The incoming email's content. Automatically filled by the autoresponder when a reply is being generated.</span>
                    </li>
                    <li>
                      <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-blue-600 dark:text-blue-400">{`{{conversation}}`}</code>
                      <span className="ml-2">— The full conversation thread history. Useful when the email is part of an ongoing back-and-forth.</span>
                    </li>
                    <li>
                      <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-blue-600 dark:text-blue-400">{`{{your_variable}}`}</code>
                      <span className="ml-2">— Any custom variable you list in the Variables field. Fill these in your prompt and they'll be replaced at runtime.</span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Example Two-Step Flow</h4>
                  <p><strong>Step 1:</strong> "Analyze this email and extract the key questions. Output as a numbered list. Email: {`{{email}}`}"</p>
                  <p className="mt-2"><strong>Step 2:</strong> "Using this analysis, write a professional reply that answers each question. Use our company info for context: {`{{business_data}}`}. Analysis: {`{{step1_result}}`}"</p>
                  <p className="mt-2 text-gray-500 dark:text-gray-400">The AI runs Step 1, gets the numbered list, inserts that list into Step 2, and Step 2 produces the final email reply.</p>
                </div>
              </div>

              <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowInfoDialog(false)}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
