import React, { useState, useRef, useEffect } from 'react';
import { File, Plus, Upload as UploadIcon, Info, Sparkles } from 'lucide-react';
import { TemplateList } from './components/TemplateList';
import { TemplateEditor } from './components/TemplateEditor';
import type { Template } from './types';
import { exportAsHTML, exportAsPDF, exportAsDOCX } from './utils/exportUtils';
import { createTemplateFromFile } from './utils/importUtils';
import { htmlToDocxJsonContent } from './utils/docxConvert';
import { supabase } from '../../lib/supabase';

interface TemplatesPageProps {
  onSignOut: () => void;
  currentView: string;
}

interface PlaceholderSection {
  title: string;
  items: { key: string; description: string }[];
}

const PLACEHOLDER_SECTIONS: PlaceholderSection[] = [
  {
    title: 'Contact Data',
    items: [
      { key: 'first_name', description: 'Contact first name' },
      { key: 'last_name', description: 'Contact last name' },
      { key: 'name', description: 'Contact full name' },
      { key: 'email', description: 'Contact email address' },
      { key: 'phone', description: 'Primary phone number' },
      { key: 'phone_cell', description: 'Cell phone number' },
      { key: 'phone_business', description: 'Business phone number' },
      { key: 'phone_brokerage', description: 'Brokerage phone number' },
      { key: 'business_name', description: 'Business or company name' },
      { key: 'screen_name', description: 'Contact screen or display name' },
      { key: 'profile_url', description: 'Contact profile URL' },
    ],
  },
  {
    title: 'Listing Data',
    items: [
      { key: 'listing_address', description: 'Property street address' },
      { key: 'listing_city', description: 'Property city' },
      { key: 'listing_state', description: 'Property state' },
      { key: 'listing_zip', description: 'Property ZIP code' },
      { key: 'listing_price', description: 'Listing price' },
      { key: 'listing_bedrooms', description: 'Number of bedrooms' },
      { key: 'listing_bathrooms', description: 'Number of bathrooms' },
      { key: 'listing_sqft', description: 'Property square footage' },
      { key: 'listing_type', description: 'Property type' },
      { key: 'listing_url', description: 'Public listing URL' },
      { key: 'listing_status', description: 'Current listing status' },
    ],
  },
  {
    title: 'Campaign & Sender Data',
    items: [
      { key: 'sender_name', description: 'Sender full name' },
      { key: 'sender_email', description: 'Sender email address' },
      { key: 'sender_phone', description: 'Sender phone number' },
      { key: 'sender_city', description: 'Sender city' },
      { key: 'sender_state', description: 'Sender state' },
      { key: 'offer_price', description: 'Calculated offer price' },
      { key: 'emd', description: 'Earnest money deposit' },
      { key: 'option_period', description: 'Option period length' },
      { key: 'days_till_close', description: 'Days until closing' },
      { key: 'close_date', description: 'Projected closing date' },
      { key: 'title_company', description: 'Title company name' },
      { key: 'city', description: 'Campaign target city' },
      { key: 'todays_date', description: "Today's date" },
    ],
  },
];

export function TemplatesPage({ onSignOut, currentView }: TemplatesPageProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const templateFileRef = useRef<HTMLInputElement>(null);

  // Fetch templates when component mounts
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data: templates, error } = await supabase
        .from('templates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setTemplates(templates.map(template => ({
        ...template,
        lastModified: template.updated_at
      })));
    } catch (error) {
      console.error('Error fetching templates:', error);
      alert('Failed to load templates. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    const newTemplate: Template = {
      id: '',  // Will be set by Supabase
      name: 'Untitled Template',
      content: '',
      lastModified: new Date().toISOString(),
      format: 'html'
    };
    setCurrentTemplate(newTemplate);
  };

  const handleSaveTemplate = async (template: Template) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      let contentToStore = template.content;
      if (template.format === 'docx') {
        contentToStore = await htmlToDocxJsonContent(template.content);
      }

      const templateData = {
        name: template.name,
        content: contentToStore,
        format: template.format,
        imported: template.imported || false,
        user_id: user.data.user.id,
        updated_at: new Date().toISOString()
      };

      let result;
      if (template.id) {
        // Update existing template
        result = await supabase
          .from('templates')
          .update(templateData)
          .eq('id', template.id)
          .select()
          .single();
      } else {
        // Create new template
        result = await supabase
          .from('templates')
          .insert(templateData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      await fetchTemplates();
      setCurrentTemplate(null);
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template. Please try again.');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      // First, clear the content to reduce payload size for server-side processing
      const { error: updateError } = await supabase
        .from('templates')
        .update({ content: '' })
        .eq('id', id);

      if (updateError) throw updateError;

      // Then delete the template
      const { error: deleteError } = await supabase
        .from('templates')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template. Please try again.');
    }
  };

  const handleImportTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      if (file.type === 'application/json') {
        // Handle JSON template files
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const template = JSON.parse(event.target?.result as string);
            if (template.name && template.content) {
              const templateData = {
                name: template.name,
                content: template.content,
                format: template.format || 'html',
                imported: true,
                user_id: user.data.user.id
              };

              const { error } = await supabase
                .from('templates')
                .insert(templateData);

              if (error) throw error;
              await fetchTemplates();
            } else {
              throw new Error('Invalid template format');
            }
          } catch (error) {
            alert('Failed to import template. Please check the file format.');
          }
        };
        reader.readAsText(file);
      } else {
        // Handle HTML, DOCX, and PDF files
        const newTemplate = await createTemplateFromFile(file);
        const templateData = {
          name: newTemplate.name,
          content: newTemplate.content,
          format: newTemplate.format,
          imported: true,
          user_id: user.data.user.id
        };

        const { error } = await supabase
          .from('templates')
          .insert(templateData);

        if (error) throw error;
        await fetchTemplates();
      }
    } catch (error) {
      console.error('Import error:', error);
      alert(error instanceof Error ? error.message : 'Failed to import template');
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  const handleExportTemplate = async (template: Template) => {
    try {
      switch (template.format) {
        case 'html':
          exportAsHTML(template.content, template.name);
          break;
        case 'pdf':
          await exportAsPDF(template.content, template.name);
          break;
        case 'docx':
          await exportAsDOCX(template.content, template.name);
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export template. Please try again.');
    }
  };

  const handleEditTemplate = (template: Template) => {
    if (template.imported && template.format !== 'docx') {
      alert('Imported templates cannot be edited. You can create a copy instead.');
      return;
    }
    setCurrentTemplate(template);
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
      <div className="max-w-4xl mx-auto">
        {!currentTemplate && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <File className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => templateFileRef.current?.click()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <UploadIcon className="w-4 h-4 mr-2" />
                  Import
                </button>
                <button
                  onClick={handleCreateTemplate}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </button>
              </div>
            </div>

            <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
              <div className="flex items-start gap-3 mb-4">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-200">
                    Available Template Placeholders
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                    Use <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-xs font-mono">{'{{placeholder}}'}</code> syntax in your template content or subject lines. Missing values are replaced with the fallback shown below.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {PLACEHOLDER_SECTIONS.map(section => (
                  <div key={section.title}>
                    <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-3 uppercase tracking-wide">
                      {section.title}
                    </h4>
                    <ul className="space-y-2">
                      {section.items.map(item => (
                        <li key={item.key}>
                          <code className="px-1.5 py-0.5 rounded bg-white dark:bg-gray-800 text-xs font-mono text-gray-900 dark:text-white border border-blue-200 dark:border-blue-800">
                            {`{{${item.key}}}`}
                          </code>
                          <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {item.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-5">
              <div className="flex items-start gap-3 mb-3">
                <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-200">
                    Advanced Features
                  </h3>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-1">
                    Go beyond simple placeholders with conditionals and nested fields.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-emerald-100 dark:bg-emerald-900/40">
                    <tr className="text-left text-emerald-900 dark:text-emerald-200">
                      <th className="px-3 py-2 font-medium">Feature</th>
                      <th className="px-3 py-2 font-medium">Syntax</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-200 dark:divide-emerald-800 bg-white dark:bg-gray-800">
                    <tr>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">Conditional block</td>
                      <td className="px-3 py-2">
                        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-900 dark:text-white whitespace-nowrap">
                          {'{{#if field}}...{{/if}}'}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        Only renders the block when the field has a value. Useful for optional sentences.
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">Sender fields</td>
                      <td className="px-3 py-2">
                        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-900 dark:text-white whitespace-nowrap">
                          {'{{sender_name}}'}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        Pulled from the campaign configuration (name, phone, city, state, title company, etc.).
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">Custom placeholder</td>
                      <td className="px-3 py-2">
                        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-900 dark:text-white whitespace-nowrap">
                          {'{{your_key}}'}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        Add your own keys and fallbacks in Settings &rarr; Data Quality.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {currentTemplate ? (
          <TemplateEditor
            template={currentTemplate}
            onSave={handleSaveTemplate}
            onCancel={() => setCurrentTemplate(null)}
          />
        ) : (
          <TemplateList
            templates={templates}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
            onExport={handleExportTemplate}
          />
        )}
      </div>

      <input
        type="file"
        ref={templateFileRef}
        onChange={handleImportTemplate}
        accept=".json,.html,.docx,.pdf"
        className="hidden"
      />
    </div>
  );
}