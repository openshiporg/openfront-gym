import { GYM_TEMPLATES } from '../config/templates';

// Helper function to extract display items from JSON data
export function getItemsFromJsonData(jsonData: any, sectionType: string): string[] {
  if (!jsonData) return [];

  switch (sectionType) {
    case 'membershipTiers':
      return (jsonData.membershipTiers || []).map((p: any) => p.name || 'Unknown Plan');
    case 'classTypes':
      return (jsonData.classTypes || []).map((c: any) => c.name || 'Unknown Class');
    case 'instructors':
      return (jsonData.instructors || []).map((t: any) =>
        `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Unknown Instructor'
      );
    default:
      return [];
  }
}

// Helper to get the right slice of seed data for a template
export function getSeedForTemplate(
  template: 'full' | 'minimal' | 'custom',
  seedData: any,
  customData?: Record<string, string[]>
) {
  const templateToUse = template === 'custom' ? 'minimal' : template;
  const tpl = GYM_TEMPLATES[templateToUse];

  return {
    membershipTiers: (seedData.membershipTiers as any[]).filter((p: any) =>
      tpl.membershipTiers.includes(p.handle)
    ),
    classTypes: (seedData.classTypes as any[]).filter((c: any) =>
      tpl.classTypes.includes(c.handle)
    ),
    instructors: (seedData.instructors as any[]).filter((t: any) =>
      tpl.instructors.includes(t.handle)
    ),
  };
}
