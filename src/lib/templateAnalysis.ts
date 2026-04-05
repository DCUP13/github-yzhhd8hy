export interface TemplateFieldUsage {
  field: string;
  isRequired: boolean;
  isConditional: boolean;
  occurrences: number;
}

export interface TemplateAnalysis {
  requiredFields: string[];
  optionalFields: string[];
  allFields: string[];
  fieldUsage: TemplateFieldUsage[];
}

export function analyzeTemplate(templateContent: string): TemplateAnalysis {
  const fieldUsageMap = new Map<string, TemplateFieldUsage>();

  const handlebarRegex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = handlebarRegex.exec(templateContent)) !== null) {
    const expression = match[1].trim();

    const isConditionalStart = expression.startsWith('#if ');
    const isConditionalEnd = expression.startsWith('/if');

    if (isConditionalEnd) continue;

    let fieldName = expression;
    let isConditional = false;

    if (isConditionalStart) {
      fieldName = expression.substring(4).trim();
      isConditional = true;
    }

    fieldName = fieldName.split('.')[0].trim();

    if (fieldName && !fieldName.startsWith('#') && !fieldName.startsWith('/')) {
      const existing = fieldUsageMap.get(fieldName);

      if (existing) {
        fieldUsageMap.set(fieldName, {
          field: fieldName,
          isRequired: existing.isRequired || !isConditional,
          isConditional: existing.isConditional || isConditional,
          occurrences: existing.occurrences + 1
        });
      } else {
        fieldUsageMap.set(fieldName, {
          field: fieldName,
          isRequired: !isConditional,
          isConditional: isConditional,
          occurrences: 1
        });
      }
    }
  }

  const fieldUsage = Array.from(fieldUsageMap.values());
  const requiredFields = fieldUsage
    .filter(f => f.isRequired)
    .map(f => f.field);
  const optionalFields = fieldUsage
    .filter(f => !f.isRequired)
    .map(f => f.field);
  const allFields = fieldUsage.map(f => f.field);

  return {
    requiredFields,
    optionalFields,
    allFields,
    fieldUsage
  };
}

export function detectConditionalBlock(templateContent: string, position: number): boolean {
  const beforeContent = templateContent.substring(0, position);
  const afterContent = templateContent.substring(position);

  const openIfCount = (beforeContent.match(/\{\{#if /g) || []).length;
  const closeIfCount = (beforeContent.match(/\{\{\/if\}\}/g) || []).length;

  return openIfCount > closeIfCount;
}
