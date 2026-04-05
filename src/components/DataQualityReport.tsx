import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, TrendingUp, Users, AlertCircle } from 'lucide-react';
import type { DataQualityReport } from '../lib/dataQuality';

interface DataQualityReportProps {
  report: DataQualityReport;
  minimumQualityScore?: number;
  onClose?: () => void;
}

export function DataQualityReportComponent({ report, minimumQualityScore = 0, onClose }: DataQualityReportProps) {
  const hasIssues = report.missingRequiredCount > 0 || report.overallScore < minimumQualityScore;
  const hasWarnings = report.missingImportantCount > 0 && !hasIssues;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className="space-y-6">
      {hasIssues && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex gap-3">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-900 dark:text-red-200 mb-1">Data Quality Issues Detected</h4>
              <p className="text-sm text-red-800 dark:text-red-300">
                {report.missingRequiredCount > 0 && (
                  <span className="block">
                    {report.missingRequiredCount} required field(s) are missing across your contacts.
                  </span>
                )}
                {report.overallScore < minimumQualityScore && (
                  <span className="block">
                    Overall quality score ({report.overallScore}%) is below the minimum threshold ({minimumQualityScore}%).
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {hasWarnings && !hasIssues && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">Data Quality Warnings</h4>
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                {report.missingImportantCount} important field(s) are missing. Campaign can proceed but results may be affected.
              </p>
            </div>
          </div>
        </div>
      )}

      {!hasIssues && !hasWarnings && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-green-900 dark:text-green-200 mb-1">Data Quality Looks Good!</h4>
              <p className="text-sm text-green-800 dark:text-green-300">
                Your contact data meets all quality requirements for this campaign.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-lg ${getScoreBgColor(report.overallScore)}`}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className={`w-4 h-4 ${getScoreColor(report.overallScore)}`} />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Overall Score</span>
          </div>
          <div className={`text-2xl font-bold ${getScoreColor(report.overallScore)}`}>
            {report.overallScore}%
          </div>
        </div>

        <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Total Contacts</span>
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {report.totalContacts}
          </div>
        </div>

        <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">With Issues</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {report.contactsWithIssues}
          </div>
        </div>

        <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Avg Complete</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {report.averageCompleteness}%
          </div>
        </div>
      </div>

      {report.fieldStats.length > 0 && (
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Missing Fields Breakdown</h4>
          <div className="space-y-2">
            {report.fieldStats.slice(0, 10).map((stat) => (
              <div key={stat.fieldName} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    stat.importance === 'required'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {stat.importance}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {stat.fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Missing in {stat.missingCount} contact{stat.missingCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {stat.missingPercent}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-sm text-gray-500 dark:text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p>
          Quality scores are calculated based on field importance weights configured in Settings → Data Quality.
          Required fields have the highest impact on the score.
        </p>
      </div>
    </div>
  );
}
