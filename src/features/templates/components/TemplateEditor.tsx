import React, { useRef, useState } from 'react';
import { Save, X, Sparkles } from 'lucide-react';
import type { Template } from '../types';
import { RichTextEditor, type RichTextEditorRef } from './RichTextEditor';
import { SaveAsDialog } from './SaveAsDialog';
import { FilePreview } from './FilePreview';
import { AIGenerateDialog } from './AIGenerateDialog';

interface TemplateEditorProps {
  template: Template;
  onSave: (template: Template) => void;
  onCancel: () => void;
}

export function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const editorRef = useRef<RichTextEditorRef>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [pendingTitle, setPendingTitle] = useState(template.name || '');

  const handleAIGenerate = (html: string, title: string) => {
    editorRef.current?.setContent(html);
    setPendingTitle(title || 'Untitled Template');
    setShowAIDialog(false);
  };

  const handleSave = (name: string, format: 'html' | 'pdf' | 'docx') => {
    if (!editorRef.current) return;
    
    onSave({
      ...template,
      name,
      content: editorRef.current.getContent(),
      format,
      lastModified: new Date().toISOString()
    });

    setShowSaveDialog(false);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {pendingTitle || 'Untitled Template'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="w-4 h-4 mr-2" />
              Close
            </button>
            {!template.imported && (
              <>
                <button
                  onClick={() => setShowAIDialog(true)}
                  className="inline-flex items-center px-4 py-2 border border-blue-300 dark:border-blue-600 text-sm font-medium rounded-lg text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate with AI
                </button>
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {template.imported ? (
            <FilePreview format={template.format} content={template.content} />
          ) : (
            <RichTextEditor
              ref={editorRef}
              content={template.content}
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          )}
        </div>
      </div>

      {showSaveDialog && (
        <SaveAsDialog
          initialName={pendingTitle}
          onSave={handleSave}
          onClose={() => setShowSaveDialog(false)}
        />
      )}

      {showAIDialog && (
        <AIGenerateDialog
          onGenerate={handleAIGenerate}
          onClose={() => setShowAIDialog(false)}
        />
      )}
    </div>
  );
}