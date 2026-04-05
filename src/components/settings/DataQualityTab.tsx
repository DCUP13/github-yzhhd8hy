import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertCircle, CheckCircle, Save } from 'lucide-react';

interface FieldConfig {
  id: string;
  field_name: string;
  importance_level: 'required' | 'important' | 'optional';
  weight: number;
}

export function DataQualityTab() {
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');

  const availableFields = [
    'first_name', 'last_name', 'email', 'phone',
    'company', 'title', 'address', 'city',
    'state', 'zip', 'website', 'notes'
  ];

  useEffect(() => {
    fetchFieldConfigs();
  }, []);

  const fetchFieldConfigs = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('field_importance_config')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('importance_level', { ascending: false });

      if (error) throw error;

      setFieldConfigs(data || []);
    } catch (error) {
      console.error('Error fetching field configs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportanceChange = async (fieldId: string, newImportance: 'required' | 'important' | 'optional') => {
    try {
      const { error } = await supabase
        .from('field_importance_config')
        .update({ importance_level: newImportance })
        .eq('id', fieldId);

      if (error) throw error;

      setFieldConfigs(prev =>
        prev.map(f => f.id === fieldId ? { ...f, importance_level: newImportance } : f)
      );
    } catch (error) {
      console.error('Error updating field importance:', error);
      alert('Failed to update field importance. Please try again.');
    }
  };

  const handleWeightChange = async (fieldId: string, newWeight: number) => {
    try {
      const { error } = await supabase
        .from('field_importance_config')
        .update({ weight: newWeight })
        .eq('id', fieldId);

      if (error) throw error;

      setFieldConfigs(prev =>
        prev.map(f => f.id === fieldId ? { ...f, weight: newWeight } : f)
      );
    } catch (error) {
      console.error('Error updating field weight:', error);
      alert('Failed to update field weight. Please try again.');
    }
  };

  const handleAddField = async () => {
    if (!newFieldName.trim()) return;

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('field_importance_config')
        .insert({
          user_id: user.data.user.id,
          field_name: newFieldName.toLowerCase().trim(),
          importance_level: 'optional',
          weight: 3
        })
        .select()
        .single();

      if (error) throw error;

      setFieldConfigs(prev => [...prev, data]);
      setNewFieldName('');
    } catch (error: any) {
      if (error.code === '23505') {
        alert('This field already exists in your configuration.');
      } else {
        console.error('Error adding field:', error);
        alert('Failed to add field. Please try again.');
      }
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('field_importance_config')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;

      setFieldConfigs(prev => prev.filter(f => f.id !== fieldId));
    } catch (error) {
      console.error('Error deleting field:', error);
      alert('Failed to delete field. Please try again.');
    }
  };

  const getImportanceBadgeColor = (level: string) => {
    switch (level) {
      case 'required':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'important':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'optional':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Field Importance Configuration
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Configure which contact fields are required, important, or optional. This helps the system calculate data quality scores and warn you about missing information before sending campaigns.
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-medium mb-1">How this works:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Required:</strong> Campaigns will warn if these fields are missing (weight: 8-10)</li>
              <li><strong>Important:</strong> Nice to have, affects data quality score (weight: 5-7)</li>
              <li><strong>Optional:</strong> Not critical, minimal impact on quality (weight: 1-4)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-gray-900 dark:text-white">Contact Fields</h4>

        <div className="space-y-2">
          {fieldConfigs.map((field) => (
            <div
              key={field.id}
              className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
            >
              <div className="flex-1">
                <span className="font-medium text-gray-900 dark:text-white">
                  {field.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={field.importance_level}
                  onChange={(e) => handleImportanceChange(field.id, e.target.value as any)}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="required">Required</option>
                  <option value="important">Important</option>
                  <option value="optional">Optional</option>
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Weight:</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={field.weight}
                    onChange={(e) => handleWeightChange(field.id, parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={() => handleDeleteField(field.id)}
                  className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddField()}
            placeholder="Add new field name..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddField}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Add Field
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Add any custom field names that match your contact data structure.
        </p>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">Quick Reference</h4>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              Required
            </span>
            <span className="text-gray-600 dark:text-gray-400">Must have</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Important
            </span>
            <span className="text-gray-600 dark:text-gray-400">Should have</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
              Optional
            </span>
            <span className="text-gray-600 dark:text-gray-400">Nice to have</span>
          </div>
        </div>
      </div>
    </div>
  );
}
