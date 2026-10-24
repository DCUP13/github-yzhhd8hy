import React, { useRef, useState } from 'react';
import { Save, X, Sparkles } from 'lucide-react';
import type { Template } from '../types';
import { RichTextEditor, type RichTextEditorRef } from './RichTextEditor';
import { SaveAsDialog } from './SaveAsDialog';
import { FilePreview } from './FilePreview';
import { AIGenerateDialog } from './AIGenerateDialog';
import { getDocxPreviewHtml } from '../utils/docxConvert';

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

  const isDocx = template.format === 'docx';
  const isEditableImport = !template.imported || isDocx;
  const initialEditorContent = isDocx
    ? getDocxPreviewHtml(template.content)
    : template.content;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      <div className="border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:mb-4">
          {isEditableImport ? (
            <input
              type="text"
              value={pendingTitle}
              onChange={(e) => setPendingTitle(e.target.value)}
              placeholder="Untitled Template"
              aria-label="Template name"
              className="flex-1 min-w-0 basis-48 text-lg sm:text-xl font-semibold text-gray-900 dark:text-white bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none rounded-lg px-2 py-1 -ml-2 transition-colors"
            />
          ) : (
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white min-w-0 truncate">
              {pendingTitle || 'Untitled Template'}
            </h2>
          )}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={onCancel}
              className="inline-flex items-center px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              Close
            </button>
            {isEditableImport && (
              <>
                {!template.imported && (
                  <button
                    onClick={() => setShowAIDialog(true)}
                    className="inline-flex items-center px-2.5 py-1.5 sm:px-4 sm:py-2 border border-blue-300 dark:border-blue-600 text-xs sm:text-sm font-medium rounded-lg text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                    <span className="sm:hidden">AI</span>
                    <span className="hidden sm:inline">Generate with AI</span>
                  </button>
                )}
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="inline-flex items-center px-2.5 py-1.5 sm:px-4 sm:py-2 border border-transparent text-xs sm:text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                  Save
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 p-3 sm:p-6 overflow-auto">
        <div className="max-w-4xl mx-auto w-full min-w-0">
          {template.imported && !isDocx ? (
            <FilePreview format={template.format} content={template.content} />
          ) : (
            <RichTextEditor
              ref={editorRef}
              content={initialEditorContent}
              className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          )}
        </div>
      </div>

      {showSaveDialog && (
        <SaveAsDialog
          initialName={pendingTitle}
          initialFormat={template.format}
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