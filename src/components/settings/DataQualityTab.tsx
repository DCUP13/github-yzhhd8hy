import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertCircle, Sparkles, RotateCcw } from 'lucide-react';

interface FieldConfig {
  id: string;
  field_name: string;
  importance_level: 'required' | 'important' | 'optional';
  weight: number;
}

type PlaceholderTier = 'critical' | 'important' | 'optional';

interface PlaceholderRow {
  placeholder_key: string;
  tier: PlaceholderTier;
  fallback_text: string;
  description: string;
  defaultTier: PlaceholderTier;
  defaultFallback: string;
  isOverridden: boolean;
  userOverrideId?: string;
}

export function DataQualityTab() {
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [placeholders, setPlaceholders] = useState<PlaceholderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newFieldName, setNewFieldName] = useState('');
  const [newPlaceholderKey, setNewPlaceholderKey] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    await Promise.all([fetchFieldConfigs(), fetchPlaceholderConfigs()]);
    setIsLoading(false);
  };

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
    }
  };

  const fetchPlaceholderConfigs = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const [{ data: defaults }, { data: overrides }] = await Promise.all([
        supabase
          .from('default_placeholder_config')
          .select('placeholder_key, tier, fallback_text, description'),
        supabase
          .from('placeholder_config')
          .select('id, placeholder_key, tier, fallback_text')
          .eq('user_id', user.data.user.id),
      ]);

      const overrideMap = new Map<string, { id: string; tier: PlaceholderTier; fallback_text: string }>();
      (overrides || []).forEach((o: any) => {
        overrideMap.set(o.placeholder_key, {
          id: o.id,
          tier: o.tier,
          fallback_text: o.fallback_text ?? '',
        });
      });

      const rows: PlaceholderRow[] = (defaults || []).map((d: any) => {
        const override = overrideMap.get(d.placeholder_key);
        overrideMap.delete(d.placeholder_key);
        return {
          placeholder_key: d.placeholder_key,
          tier: (override?.tier ?? d.tier) as PlaceholderTier,
          fallback_text: override?.fallback_text ?? d.fallback_text ?? '',
          description: d.description ?? '',
          defaultTier: d.tier,
          defaultFallback: d.fallback_text ?? '',
          isOverridden: !!override,
          userOverrideId: override?.id,
        };
      });

      overrideMap.forEach((o, key) => {
        rows.push({
          placeholder_key: key,
          tier: o.tier,
          fallback_text: o.fallback_text,
          description: 'Custom placeholder',
          defaultTier: 'optional',
          defaultFallback: '',
          isOverridden: true,
          userOverrideId: o.id,
        });
      });

      rows.sort((a, b) => a.placeholder_key.localeCompare(b.placeholder_key));
      setPlaceholders(rows);
    } catch (error) {
      console.error('Error fetching placeholder configs:', error);
    }
  };

  const updatePlaceholderLocal = (key: string, updates: Partial<PlaceholderRow>) => {
    setPlaceholders(prev => prev.map(p => (p.placeholder_key === key ? { ...p, ...updates } : p)));
  };

  const savePlaceholder = async (row: PlaceholderRow) => {
    try {
      setSavingKey(row.placeholder_key);
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('placeholder_config')
        .upsert(
          {
            user_id: user.data.user.id,
            placeholder_key: row.placeholder_key,
            tier: row.tier,
            fallback_text: row.fallback_text,
          },
          { onConflict: 'user_id,placeholder_key' }
        )
        .select()
        .maybeSingle();

      if (error) throw error;

      updatePlaceholderLocal(row.placeholder_key, {
        isOverridden: true,
        userOverrideId: data?.id ?? row.userOverrideId,
      });
    } catch (error) {
      console.error('Error saving placeholder:', error);
      alert('Failed to save fallback. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  const resetPlaceholder = async (row: PlaceholderRow) => {
    if (!row.userOverrideId) return;
    try {
      setSavingKey(row.placeholder_key);
      const { error } = await supabase
        .from('placeholder_config')
        .delete()
        .eq('id', row.userOverrideId);

      if (error) throw error;

      setPlaceholders(prev =>
        prev
          .map(p =>
            p.placeholder_key === row.placeholder_key
              ? {
                  ...p,
                  tier: row.defaultTier,
                  fallback_text: row.defaultFallback,
                  isOverridden: false,
                  userOverrideId: undefined,
                }
              : p
          )
          .filter(p => !(p.description === 'Custom placeholder' && p.placeholder_key === row.placeholder_key))
      );
    } catch (error) {
      console.error('Error resetting placeholder:', error);
      alert('Failed to reset. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleAddPlaceholder = async () => {
    const key = newPlaceholderKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key) return;
    if (placeholders.some(p => p.placeholder_key === key)) {
      alert('That placeholder already exists.');
      return;
    }
    const row: PlaceholderRow = {
      placeholder_key: key,
      tier: 'optional',
      fallback_text: '',
      description: 'Custom placeholder',
      defaultTier: 'optional',
      defaultFallback: '',
      isOverridden: false,
    };
    setPlaceholders(prev => [...prev, row].sort((a, b) => a.placeholder_key.localeCompare(b.placeholder_key)));
    setNewPlaceholderKey('');
    await savePlaceholder(row);
  };

  const handleImportanceChange = async (fieldId: string, newImportance: 'required' | 'important' | 'optional') => {
    try {
      const { error } = await supabase
        .from('field_importance_config')
        .update({ importance_level: newImportance })
        .eq('id', fieldId);
      if (error) throw error;
      setFieldConfigs(prev => prev.map(f => (f.id === fieldId ? { ...f, importance_level: newImportance } : f)));
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
      setFieldConfigs(prev => prev.map(f => (f.id === fieldId ? { ...f, weight: newWeight } : f)));
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
          weight: 3,
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

  const tierBadge = (tier: PlaceholderTier) => {
    switch (tier) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'important':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
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
    <div className="space-y-8">
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

      <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Smart Placeholder Fallbacks
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              When a contact is missing data for a placeholder used in a subject line or template, the fallback text below is substituted in instead of leaving a blank. This prevents awkward empty subjects or body text.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>Tip:</strong> Leave the fallback blank for fields where an empty value reads naturally (e.g. <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-xs">last_name</code>). For phrases used mid-sentence, use something generic like &ldquo;your property&rdquo; or &ldquo;there&rdquo;. Tier influences data quality scoring: <strong>critical</strong> placeholders heavily penalize missing data, <strong>important</strong> moderately, <strong>optional</strong> minimally.
          </p>
        </div>

        <div className="space-y-2">
          {placeholders.map((row) => {
            const isSaving = savingKey === row.placeholder_key;
            const dirty =
              row.isOverridden
                ? false
                : row.fallback_text !== row.defaultFallback || row.tier !== row.defaultTier;
            return (
              <div
                key={row.placeholder_key}
                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="px-2 py-1 rounded bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600">
                      {`{{${row.placeholder_key}}}`}
                    </code>
                    {row.isOverridden && (
                      <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Custom
                      </span>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded ${tierBadge(row.tier)}`}>
                      {row.tier}
                    </span>
                  </div>
                  {row.description && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {row.description}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-2 items-center">
                  <select
                    value={row.tier}
                    onChange={(e) =>
                      updatePlaceholderLocal(row.placeholder_key, {
                        tier: e.target.value as PlaceholderTier,
                      })
                    }
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="important">Important</option>
                    <option value="optional">Optional</option>
                  </select>

                  <input
                    type="text"
                    value={row.fallback_text}
                    onChange={(e) =>
                      updatePlaceholderLocal(row.placeholder_key, {
                        fallback_text: e.target.value,
                      })
                    }
                    placeholder="Fallback text when data is missing"
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => savePlaceholder(row)}
                      disabled={isSaving || (!dirty && row.isOverridden === false)}
                      className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    {row.isOverridden && (
                      <button
                        onClick={() => resetPlaceholder(row)}
                        disabled={isSaving}
                        title="Reset to default"
                        className="px-2 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newPlaceholderKey}
            onChange={(e) => setNewPlaceholderKey(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddPlaceholder()}
            placeholder="Add custom placeholder key (e.g. listing_address)"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddPlaceholder}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Add Placeholder
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Use lowercase letters, numbers, and underscores. These keys match <code>{'{{placeholder}}'}</code> usage in your subject lines and templates.
        </p>
      </div>
    </div>
  );
}
