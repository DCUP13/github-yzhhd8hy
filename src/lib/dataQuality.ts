export interface FieldImportance {
  field_name: string;
  importance_level: 'required' | 'important' | 'optional';
  weight: number;
}

export interface Contact {
  [key: string]: any;
}

export interface ContactQuality {
  contactId: string;
  qualityScore: number;
  missingRequired: string[];
  missingImportant: string[];
  totalFields: number;
  filledFields: number;
  percentComplete: number;
}

export interface DataQualityReport {
  overallScore: number;
  totalContacts: number;
  contactsWithIssues: number;
  averageCompleteness: number;
  missingRequiredCount: number;
  missingImportantCount: number;
  fieldStats: {
    fieldName: string;
    importance: string;
    missingCount: number;
    missingPercent: number;
  }[];
  contactDetails: ContactQuality[];
}

export function calculateContactQualityScore(
  contact: Contact,
  fieldImportance: FieldImportance[]
): ContactQuality {
  let totalWeight = 0;
  let earnedWeight = 0;
  let filledFields = 0;
  const missingRequired: string[] = [];
  const missingImportant: string[] = [];

  fieldImportance.forEach(field => {
    totalWeight += field.weight;

    const value = contact[field.field_name];
    const hasValue = value !== null && value !== undefined && value !== '';

    if (hasValue) {
      earnedWeight += field.weight;
      filledFields++;
    } else {
      if (field.importance_level === 'required') {
        missingRequired.push(field.field_name);
      } else if (field.importance_level === 'important') {
        missingImportant.push(field.field_name);
      }
    }
  });

  const qualityScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const percentComplete = fieldImportance.length > 0
    ? Math.round((filledFields / fieldImportance.length) * 100)
    : 0;

  return {
    contactId: contact.id || '',
    qualityScore,
    missingRequired,
    missingImportant,
    totalFields: fieldImportance.length,
    filledFields,
    percentComplete
  };
}

export function generateDataQualityReport(
  contacts: Contact[],
  fieldImportance: FieldImportance[]
): DataQualityReport {
  const contactDetails = contacts.map(contact =>
    calculateContactQualityScore(contact, fieldImportance)
  );

  const totalContacts = contacts.length;
  const overallScore = contactDetails.length > 0
    ? Math.round(
        contactDetails.reduce((sum, c) => sum + c.qualityScore, 0) / contactDetails.length
      )
    : 0;

  const averageCompleteness = contactDetails.length > 0
    ? Math.round(
        contactDetails.reduce((sum, c) => sum + c.percentComplete, 0) / contactDetails.length
      )
    : 0;

  const contactsWithIssues = contactDetails.filter(
    c => c.missingRequired.length > 0 || c.missingImportant.length > 0
  ).length;

  const missingRequiredCount = contactDetails.reduce(
    (sum, c) => sum + c.missingRequired.length,
    0
  );

  const missingImportantCount = contactDetails.reduce(
    (sum, c) => sum + c.missingImportant.length,
    0
  );

  const fieldStatsMap = new Map<string, { importance: string; count: number }>();

  contactDetails.forEach(contact => {
    contact.missingRequired.forEach(field => {
      const existing = fieldStatsMap.get(field) || { importance: 'required', count: 0 };
      fieldStatsMap.set(field, { ...existing, count: existing.count + 1 });
    });

    contact.missingImportant.forEach(field => {
      const existing = fieldStatsMap.get(field) || { importance: 'important', count: 0 };
      fieldStatsMap.set(field, { ...existing, count: existing.count + 1 });
    });
  });

  const fieldStats = Array.from(fieldStatsMap.entries())
    .map(([fieldName, stats]) => ({
      fieldName,
      importance: stats.importance,
      missingCount: stats.count,
      missingPercent: Math.round((stats.count / totalContacts) * 100)
    }))
    .sort((a, b) => b.missingCount - a.missingCount);

  return {
    overallScore,
    totalContacts,
    contactsWithIssues,
    averageCompleteness,
    missingRequiredCount,
    missingImportantCount,
    fieldStats,
    contactDetails
  };
}

export function shouldBlockCampaign(
  qualityReport: DataQualityReport,
  minimumQualityScore: number,
  blockOnMissingRequired: boolean = true
): { shouldBlock: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (blockOnMissingRequired && qualityReport.missingRequiredCount > 0) {
    reasons.push(`${qualityReport.missingRequiredCount} required fields are missing across contacts`);
  }

  if (qualityReport.overallScore < minimumQualityScore) {
    reasons.push(
      `Overall quality score (${qualityReport.overallScore}%) is below minimum (${minimumQualityScore}%)`
    );
  }

  return {
    shouldBlock: reasons.length > 0,
    reasons
  };
}
