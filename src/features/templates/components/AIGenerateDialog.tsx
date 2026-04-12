import React, { useState } from 'react';
import { X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface FieldInfo {
  name: string;
  label: string;
  importance: 'required' | 'important' | 'optional';
}

interface FieldDefinition {
  name: string;
  label: string;
}

interface AIGenerateDialogProps {
  onGenerate: (html: string, title: string) => void;
  onClose: () => void;
}

const CONTACT_FIELDS: FieldDefinition[] = [
  { name: 'first_name', label: 'First Name' },
  { name: 'last_name', label: 'Last Name' },
  { name: 'name', label: 'Full Name' },
  { name: 'email', label: 'Email' },
  { name: 'phone', label: 'Phone' },
  { name: 'phone_cell', label: 'Cell Phone' },
  { name: 'phone_brokerage', label: 'Brokerage Phone' },
  { name: 'phone_business', label: 'Business Phone' },
  { name: 'business_name', label: 'Business Name' },
  { name: 'screen_name', label: 'Screen Name' },
  { name: 'profile_url', label: 'Profile URL' },
];

const CAMPAIGN_FIELDS: FieldDefinition[] = [
  { name: 'sender_name', label: 'Sender Name' },
  { name: 'sender_phone', label: 'Sender Phone' },
  { name: 'sender_city', label: 'Sender City' },
  { name: 'sender_state', label: 'Sender State' },
  { name: 'city', label: 'Target City' },
  { name: 'days_till_close', label: 'Days Till Close' },
  { name: 'emd', label: 'Earnest Money Deposit' },
  { name: 'option_period', label: 'Option Period' },
  { name: 'title_company', label: 'Title Company' },
];

const LISTING_FIELDS: FieldDefinition[] = [
  { name: 'listing_address', label: 'Listing Address' },
  { name: 'listing_city', label: 'Listing City' },
  { name: 'listing_state', label: 'Listing State' },
  { name: 'listing_zip', label: 'Listing Zip' },
  { name: 'listing_price', label: 'Listing Price' },
  { name: 'listing_bedrooms', label: 'Bedrooms' },
  { name: 'listing_bathrooms', label: 'Bathrooms' },
  { name: 'listing_sqft', label: 'Square Footage' },
  { name: 'listing_type', label: 'Home Type' },
  { name: 'listing_url', label: 'Listing URL' },
  { name: 'listing_status', label: 'Listing Status' },
];

const CATEGORIES = ['General', 'Real Estate', 'Email Marketing', 'Customer Service', 'Sales', 'Follow-up', 'Other'];

const IMPORTANCE_OPTIONS: { value: FieldInfo['importance']; label: string; color: string }[] = [
  { value: 'required', label: 'Required', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  { value: 'important', label: 'Important', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'optional', label: 'Optional', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
];

function FieldSection({
  title,
  fields,
  selectedFields,
  onToggle,
  onImportanceChange,
}: {
  title: string;
  fields: FieldDefinition[];
  selectedFields: Record<string, FieldInfo['importance']>;
  onToggle: (field: FieldDefinition) => void;
  onImportanceChange: (name: string, importance: FieldInfo['importance']) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-650"
      >
        {title}
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {fields.map(field => {
            const selected = field.name in selectedFields;
            const importance = selectedFields[field.name];
            return (
              <div key={field.name} className="flex items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  id={`field-${field.name}`}
                  checked={selected}
                  onChange={() => onToggle(field)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor={`field-${field.name}`}
                  className="flex-1 text-sm text-gray-700 dark:text-gray-200 cursor-pointer select-none"
                >
                  {field.label}
                  <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 font-mono">{`{{${field.name}}}`}</span>
                </label>
                {selected && (
                  <div className="flex gap-1">
                    {IMPORTANCE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onImportanceChange(field.name, opt.value)}
                        className={`px-2 py-0.5 text-xs rounded-full font-medium transition-opacity ${opt.color} ${importance === opt.value ? 'opacity-100 ring-1 ring-current' : 'opacity-40 hover:opacity-70'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AIGenerateDialog({ onGenerate, onClose }: AIGenerateDialogProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [selectedFields, setSelectedFields] = useState<Record<string, FieldInfo['importance']>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleToggle = (field: FieldDefinition) => {
    setSelectedFields(prev => {
      if (field.name in prev) {
        const next = { ...prev };
        delete next[field.name];
        return next;
      }
      return { ...prev, [field.name]: 'important' };
    });
  };

  const handleImportanceChange = (name: string, importance: FieldInfo['importance']) => {
    setSelectedFields(prev => ({ ...prev, [name]: importance }));
  };

  const handleGenerate = async () => {
    setError('');
    if (!title.trim()) { setError('Please enter a template title.'); return; }
    if (!description.trim()) { setError('Please describe what you want the template to say.'); return; }

    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const fieldsPayload: FieldInfo[] = Object.entries(selectedFields).map(([name, importance]) => {
        const allFields = [...CONTACT_FIELDS, ...CAMPAIGN_FIELDS, ...LISTING_FIELDS];
        const def = allFields.find(f => f.name === name)!;
        return { name, label: def.label, importance };
      });

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-template`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, category, selectedFields: fieldsPayload, description }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      onGenerate(data.template, title.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Generate with AI</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Property Outreach Email"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Describe your template</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Write a friendly outreach email to a real estate agent about a property listing, highlighting the price and location, and asking if they'd be open to a quick call."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select fields to include
              <span className="ml-2 text-xs font-normal text-gray-400">Click a field to add it, then set its importance level</span>
            </p>
            <div className="space-y-2">
              <FieldSection
                title="Contact Fields"
                fields={CONTACT_FIELDS}
                selectedFields={selectedFields}
                onToggle={handleToggle}
                onImportanceChange={handleImportanceChange}
              />
              <FieldSection
                title="Campaign Fields"
                fields={CAMPAIGN_FIELDS}
                selectedFields={selectedFields}
                onToggle={handleToggle}
                onImportanceChange={handleImportanceChange}
              />
              <FieldSection
                title="Listing Fields"
                fields={LISTING_FIELDS}
                selectedFields={selectedFields}
                onToggle={handleToggle}
                onImportanceChange={handleImportanceChange}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {Object.keys(selectedFields).length} field{Object.keys(selectedFields).length !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {isGenerating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
