import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Search, Sparkles, CheckSquare, Square, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TemplatesProps {
  onSignOut: () => void;
  currentView: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  format: string;
  created_at: string;
  updated_at: string;
}

interface FieldInfo {
  name: string;
  label: string;
  description: string;
  category: 'contact' | 'campaign' | 'listing';
  importance?: 'required' | 'important' | 'optional';
}

const AVAILABLE_FIELDS: FieldInfo[] = [
  { name: 'first_name', label: 'First Name', description: 'Contact first name', category: 'contact' },
  { name: 'last_name', label: 'Last Name', description: 'Contact last name', category: 'contact' },
  { name: 'name', label: 'Full Name', description: 'Contact full name', category: 'contact' },
  { name: 'email', label: 'Email', description: 'Email address', category: 'contact' },
  { name: 'phone', label: 'Phone', description: 'Phone number', category: 'contact' },
  { name: 'phone_cell', label: 'Cell Phone', description: 'Cell phone number', category: 'contact' },
  { name: 'phone_brokerage', label: 'Brokerage Phone', description: 'Brokerage phone number', category: 'contact' },
  { name: 'phone_business', label: 'Business Phone', description: 'Business phone number', category: 'contact' },
  { name: 'business_name', label: 'Business Name', description: 'Business or company name', category: 'contact' },
  { name: 'screen_name', label: 'Screen Name', description: 'Screen or display name', category: 'contact' },
  { name: 'profile_url', label: 'Profile URL', description: 'Profile URL', category: 'contact' },

  { name: 'sender_name', label: 'Your Name', description: 'Sender name', category: 'campaign' },
  { name: 'sender_phone', label: 'Your Phone', description: 'Sender phone', category: 'campaign' },
  { name: 'sender_city', label: 'Your City', description: 'Sender city', category: 'campaign' },
  { name: 'sender_state', label: 'Your State', description: 'Sender state', category: 'campaign' },
  { name: 'city', label: 'Target City', description: 'Target city', category: 'campaign' },
  { name: 'days_till_close', label: 'Days Until Close', description: 'Days until close', category: 'campaign' },
  { name: 'emd', label: 'Earnest Money Deposit', description: 'Earnest money deposit', category: 'campaign' },
  { name: 'option_period', label: 'Option Period', description: 'Option period', category: 'campaign' },
  { name: 'title_company', label: 'Title Company', description: 'Title company', category: 'campaign' },

  { name: 'listing_address', label: 'Property Address', description: 'Property address', category: 'listing' },
  { name: 'listing_city', label: 'Property City', description: 'Property city', category: 'listing' },
  { name: 'listing_state', label: 'Property State', description: 'Property state', category: 'listing' },
  { name: 'listing_zip', label: 'Property Zip', description: 'Property zip code', category: 'listing' },
  { name: 'listing_price', label: 'Listing Price', description: 'Listing price', category: 'listing' },
  { name: 'offer_price', label: 'Offer Price', description: 'Calculated offer price (configured per campaign)', category: 'listing' },
  { name: 'listing_bedrooms', label: 'Bedrooms', description: 'Number of bedrooms', category: 'listing' },
  { name: 'listing_bathrooms', label: 'Bathrooms', description: 'Number of bathrooms', category: 'listing' },
  { name: 'listing_sqft', label: 'Square Footage', description: 'Square footage', category: 'listing' },
  { name: 'listing_type', label: 'Home Type', description: 'Home type', category: 'listing' },
  { name: 'listing_url', label: 'Listing URL', description: 'Listing URL', category: 'listing' },
  { name: 'listing_status', label: 'Listing Status', description: 'Listing status', category: 'listing' }
];

const categories = [
  'General',
  'Email Marketing',
  'Real Estate',
  'Customer Service',
  'Sales',
  'Follow-up',
  'Other'
];

export function Templates({ onSignOut, currentView }: TemplatesProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [fieldImportance, setFieldImportance] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    title: '',
    category: 'General',
    description: ''
  });

  const [generatedContent, setGeneratedContent] = useState('');

  useEffect(() => {
    fetchTemplates();
    fetchFieldImportance();
  }, []);

  const fetchFieldImportance = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('field_importance_config')
        .select('field_name, importance_level')
        .eq('user_id', user.data.user.id);

      if (error) throw error;

      const importanceMap: Record<string, string> = {};
      data?.forEach(item => {
        importanceMap[item.field_name] = item.importance_level;
      });

      setFieldImportance(importanceMap);
    } catch (error) {
      console.error('Error fetching field importance:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template. Please try again.');
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetForm = () => {
    setFormData({ title: '', category: 'General', description: '' });
    setShowCreateModal(false);
    setGeneratedContent('');
    setSelectedFields([]);
  };

  const handleGenerateWithAI = async () => {
    if (!formData.title) {
      alert('Please provide a title for your template');
      return;
    }

    if (selectedFields.length === 0) {
      alert('Please select at least one field to include in your template');
      return;
    }

    setIsGeneratingAI(true);

    try {
      const selectedFieldsWithImportance = selectedFields.map(fieldName => {
        const field = AVAILABLE_FIELDS.find(f => f.name === fieldName);
        const importance = fieldImportance[fieldName] || 'optional';
        return {
          name: fieldName,
          label: field?.label || fieldName,
          importance
        };
      });

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-template`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          category: formData.category,
          selectedFields: selectedFieldsWithImportance,
          description: formData.description
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate template');
      }

      const data = await response.json();

      if (data.template) {
        setGeneratedContent(data.template);
      }
    } catch (error) {
      console.error('Error generating template:', error);
      alert('Failed to generate template with AI. Please try again.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!formData.title || !generatedContent) {
      alert('Please generate a template first');
      return;
    }

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('templates')
        .insert({
          name: formData.title,
          content: generatedContent,
          format: 'html',
          user_id: user.data.user.id,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      await fetchTemplates();
      resetForm();
      alert('Template saved successfully!');
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template. Please try again.');
    }
  };

  const handleToggleField = (fieldName: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldName)
        ? prev.filter(f => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const getImportanceBadge = (fieldName: string) => {
    const importance = fieldImportance[fieldName];
    if (!importance) return null;

    const colors = {
      required: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      important: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
      optional: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    };

    return (
      <span className={`ml-2 px-2 py-0.5 text-xs rounded ${colors[importance as keyof typeof colors]}`}>
        {importance}
      </span>
    );
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Generate Template with AI
          </button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {searchQuery ? 'No templates found' : 'No templates yet'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Try adjusting your search' : 'Generate your first template to get started'}
              </p>
            </div>
          ) : (
            filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {template.name}
                  </h3>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                    title="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-4 whitespace-pre-wrap">
                  {template.content}
                </p>

                <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  Updated {new Date(template.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-4xl my-4 max-h-[calc(100vh-2rem)] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Generate Template with AI
                </h3>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <p className="font-semibold mb-1">How it works:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Select the fields you want to include in your template</li>
                        <li>AI will use the field importance settings to determine syntax</li>
                        <li>Required fields use standard syntax: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{field}}'}</code></li>
                        <li>Important/Optional fields use conditional syntax: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{#if field}}{{field}}{{/if}}'}</code></li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Template Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., Real Estate Outreach"
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Describe what you want this template to accomplish..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Select Fields to Include
                  </label>

                  {['contact', 'campaign', 'listing'].map(category => {
                    const categoryFields = AVAILABLE_FIELDS.filter(f => f.category === category);
                    return (
                      <div key={category} className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 capitalize">
                          {category} Fields
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {categoryFields.map(field => (
                            <button
                              key={field.name}
                              type="button"
                              onClick={() => handleToggleField(field.name)}
                              className={`flex items-center justify-between px-3 py-2 text-sm rounded-lg border transition-colors ${
                                selectedFields.includes(field.name)
                                  ? 'bg-blue-50 border-blue-500 text-blue-900 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-200'
                                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {selectedFields.includes(field.name) ? (
                                  <CheckSquare className="w-4 h-4 flex-shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 flex-shrink-0" />
                                )}
                                <span className="truncate">{field.label}</span>
                              </div>
                              {getImportanceBadge(field.name)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedFields.length > 0 && (
                  <button
                    type="button"
                    onClick={handleGenerateWithAI}
                    disabled={isGeneratingAI}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
                  >
                    {isGeneratingAI ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating Template...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Template with AI
                      </>
                    )}
                  </button>
                )}

                {generatedContent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Generated Template
                    </label>
                    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                      <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                        {generatedContent}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                {generatedContent && (
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    className="px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Save Template
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
