import React, { useState, useRef, useEffect } from 'react';
import { File, Plus, Upload as UploadIcon, Info } from 'lucide-react';
import { TemplateList } from './components/TemplateList';
import { TemplateEditor } from './components/TemplateEditor';
import type { Template } from './types';
import { exportAsHTML, exportAsPDF, exportAsDOCX } from './utils/exportUtils';
import { createTemplateFromFile } from './utils/importUtils';
import { supabase } from '../../lib/supabase';

interface TemplatesPageProps {
  onSignOut: () => void;
  currentView: string;
}

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

      const templateData = {
        name: template.name,
        content: template.content,
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
    if (template.imported) {
      alert('Imported templates cannot be edited. You can create a copy instead.');
      return;
    }
    setCurrentTemplate(template);
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
                <File className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => templateFileRef.current?.click()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <UploadIcon className="w-4 h-4 mr-2" />
                  Import
                </button>
                <button
                  onClick={handleCreateTemplate}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </button>
              </div>
            </div>

            <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    Available Template Placeholders
                  </h3>
                  <p className="text-xs text-blue-800 dark:text-blue-200 mb-3">
                    Use these placeholders in your templates by wrapping them in double curly braces, like <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded">{'{{name}}'}</code>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Contact Information:</p>
                      <ul className="space-y-0.5 text-blue-800 dark:text-blue-200">
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{name}}'}</code> - Contact name</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{email}}'}</code> - Email address</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{phone}}'}</code> - Phone number</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{phone_cell}}'}</code> - Cell phone</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{phone_brokerage}}'}</code> - Brokerage phone</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{phone_business}}'}</code> - Business phone</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{business_name}}'}</code> - Business name</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{screen_name}}'}</code> - Screen name</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{profile_url}}'}</code> - Profile URL</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Campaign Details:</p>
                      <ul className="space-y-0.5 text-blue-800 dark:text-blue-200">
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{sender_name}}'}</code> - Your name</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{sender_phone}}'}</code> - Your phone</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{sender_city}}'}</code> - Your city</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{sender_state}}'}</code> - Your state</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{city}}'}</code> - Target city</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{days_till_close}}'}</code> - Days until close</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{emd}}'}</code> - Earnest money deposit</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{option_period}}'}</code> - Option period</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{title_company}}'}</code> - Title company</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Listing Data:</p>
                      <ul className="space-y-0.5 text-blue-800 dark:text-blue-200">
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_address}}'}</code> - Property address</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_city}}'}</code> - Property city</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_state}}'}</code> - Property state</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_zip}}'}</code> - Property zip code</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_price}}'}</code> - Listing price</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_bedrooms}}'}</code> - Number of bedrooms</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_bathrooms}}'}</code> - Number of bathrooms</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_sqft}}'}</code> - Square footage</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_type}}'}</code> - Home type</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_url}}'}</code> - Listing URL</li>
                        <li><code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">{'{{listing_status}}'}</code> - Listing status</li>
                      </ul>
                    </div>
                  </div>
                </div>
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