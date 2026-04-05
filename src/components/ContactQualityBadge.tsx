import React, { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateContactQualityScore, type FieldImportance, type Contact } from '../lib/dataQuality';

interface ContactQualityBadgeProps {
  contact: Contact;
  showDetails?: boolean;
}

export function ContactQualityBadge({ contact, showDetails = false }: ContactQualityBadgeProps) {
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    calculateQuality();
  }, [contact]);

  const calculateQuality = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data: fieldConfigs, error } = await supabase
        .from('field_importance_config')
        .select('*')
        .eq('user_id', user.data.user.id);

      if (error) throw error;

      if (fieldConfigs && fieldConfigs.length > 0) {
        const quality = calculateContactQualityScore(contact, fieldConfigs as FieldImportance[]);
        setQualityScore(quality.qualityScore);
      }
    } catch (error) {
      console.error('Error calculating quality:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || qualityScore === null) {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Low';
  };

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getScoreColor(qualityScore)}`}>
      <BarChart3 className="w-3 h-3" />
      {showDetails ? (
        <span>{qualityScore}% Quality</span>
      ) : (
        <span>{getScoreLabel(qualityScore)}</span>
      )}
    </div>
  );
}
