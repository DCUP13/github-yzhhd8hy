import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateDataQualityReport, type DataQualityReport } from '../lib/dataQuality';
import { analyzeTemplate } from '../lib/templateAnalysis';
import { DataQualityReportComponent } from './DataQualityReport';
import type { Template } from '../features/templates/types';

interface CampaignDataQualityProps {
  campaignId?: string;
  templates: Template[];
  minDataQualityScore: number;
  skipIncompleteContacts: boolean;
  useSmartFallbacks: boolean;
  onUpdateSettings: (settings: {
    minDataQualityScore?: number;
    skipIncompleteContacts?: boolean;
    useSmartFallbacks?: boolean;
  }) => void;
}

export function CampaignDataQuality({
  campaignId,
  templates,
  minDataQualityScore,
  skipIncompleteContacts,
  useSmartFallbacks,
  onUpdateSettings
}: CampaignDataQualityProps) {
  const [qualityReport, setQualityReport] = useState<DataQualityReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedFields, setDetectedFields] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (templates.length > 0) {
      analyzeTemplateFields();
    }
  }, [templates]);

  const analyzeTemplateFields = () => {
    const allFields = new Set<string>();

    templates.forEach(template => {
      const analysis = analyzeTemplate(template.content);
      analysis.allFields.forEach(field => allFields.add(field));
    });

    setDetectedFields(Array.from(allFields));
  };

  const generateReport = async () => {
    if (!campaignId) {
      alert('Please save the campaign first to generate a data quality report.');
      return;
    }

    setIsAnalyzing(true);

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.data.user.id);

      if (contactsError) throw contactsError;

      const { data: fieldConfigs, error: configsError } = await supabase
        .from('field_importance_config')
        .select('*')
        .eq('user_id', user.data.user.id);

      if (configsError) throw configsError;

      const report = generateDataQualityReport(
        contacts || [],
        fieldConfigs || []
      );

      setQualityReport(report);
      setShowReport(true);

      if (campaignId) {
        await supabase
          .from('campaigns')
          .update({ data_quality_report: report })
          .eq('id', campaignId);
      }
    } catch (error) {
      console.error('Error generating quality report:', error);
      alert('Failed to generate data quality report. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Data Quality Settings
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure how the campaign handles incomplete contact data. These settings help ensure your emails are personalized and professional.
        </p>
      </div>

      {detectedFields.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex gap-3">
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">
                Template Fields Detected
              </h4>
              <div className="flex flex-wrap gap-2">
                {detectedFields.map(field => (
                  <span
                    key={field}
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded text-xs font-medium"
                  >
                    {field}
                  </span>
                ))}
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-300 mt-2">
                These fields will be used from your contact data. Configure their importance in Settings → Data Quality.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Minimum Data Quality Score (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={minDataQualityScore}
              onChange={(e) => onUpdateSettings({ minDataQualityScore: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Contacts below this score will be flagged in the quality report. Set to 0 to disable.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <input
            type="checkbox"
            id="skipIncomplete"
            checked={skipIncompleteContacts}
            onChange={(e) => onUpdateSettings({ skipIncompleteContacts: e.target.checked })}
            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <div className="flex-1">
            <label htmlFor="skipIncomplete" className="block text-sm font-medium text-gray-900 dark:text-white">
              Skip contacts with missing required fields
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              When enabled, contacts missing fields marked as "required" will be automatically skipped during campaign execution.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <input
            type="checkbox"
            id="smartFallbacks"
            checked={useSmartFallbacks}
            onChange={(e) => onUpdateSettings({ useSmartFallbacks: e.target.checked })}
            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <div className="flex-1">
            <label htmlFor="smartFallbacks" className="block text-sm font-medium text-gray-900 dark:text-white">
              Use smart fallbacks for missing data
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              When enabled, the system will use intelligent defaults for optional missing fields (e.g., use email username if first name is missing).
            </p>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={generateReport}
          disabled={isAnalyzing || !campaignId}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <BarChart3 className="w-4 h-4" />
              Generate Data Quality Report
            </>
          )}
        </button>
        {!campaignId && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Save the campaign first to generate a quality report
          </p>
        )}
      </div>

      {showReport && qualityReport && (
        <div className="mt-6 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Data Quality Report
            </h4>
            <button
              onClick={() => setShowReport(false)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Hide Report
            </button>
          </div>
          <DataQualityReportComponent
            report={qualityReport}
            minimumQualityScore={minDataQualityScore}
          />
        </div>
      )}
    </div>
  );
}
