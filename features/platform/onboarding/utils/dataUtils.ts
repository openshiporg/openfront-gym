import { GYM_TEMPLATES } from '../config/templates';

const DAY_LABELS: Record<string, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

export function formatScheduleDisplayName(schedule: {
  name?: string;
  dayOfWeek?: string;
  startTime?: string;
}) {
  const name = schedule.name || 'Untitled Schedule';
  const day = DAY_LABELS[schedule.dayOfWeek || ''] || schedule.dayOfWeek || 'Day';
  const time = schedule.startTime || '00:00';
  return `${name} · ${day} ${time}`;
}

// Helper function to extract display items from JSON data
export function getItemsFromJsonData(jsonData: any, sectionType: string): string[] {
  if (!jsonData) return [];

  switch (sectionType) {
    case 'gymSettings':
      return jsonData.gymSettings?.name ? [jsonData.gymSettings.name] : [];
    case 'location':
      return jsonData.location?.name ? [jsonData.location.name] : [];
    case 'membershipTiers':
      return (jsonData.membershipTiers || []).map((p: any) => p.name || 'Unknown Plan');
    case 'classTypes':
      return (jsonData.classTypes || []).map((c: any) => c.name || 'Unknown Class');
    case 'instructors':
      return (jsonData.instructors || []).map((t: any) =>
        `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Unknown Instructor'
      );
    case 'schedules':
      return (jsonData.schedules || []).map((schedule: any) => formatScheduleDisplayName(schedule));
    case 'demoMember':
      return jsonData.demoMember?.name ? [jsonData.demoMember.name] : [];
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

  const membershipTiers = (seedData.membershipTiers as any[]).filter((p: any) =>
    tpl.membershipTiers.includes(p.handle)
  );
  const classTypes = (seedData.classTypes as any[]).filter((c: any) =>
    tpl.classTypes.includes(c.handle)
  );
  const instructors = (seedData.instructors as any[]).filter((t: any) =>
    tpl.instructors.includes(t.handle)
  );
  const classTypeHandles = new Set(classTypes.map((item: any) => item.handle));
  const instructorHandles = new Set(instructors.map((item: any) => item.handle));

  return {
    gymSettings: seedData.gymSettings,
    location: seedData.location,
    membershipTiers,
    classTypes,
    instructors,
    schedules: (seedData.schedules as any[]).filter(
      (schedule: any) =>
        classTypeHandles.has(schedule.classTypeHandle) &&
        instructorHandles.has(schedule.instructorHandle)
    ),
    demoMember: seedData.demoMember
      ? {
          ...seedData.demoMember,
          membershipTierHandle:
            membershipTiers.find((tier: any) => tier.handle === seedData.demoMember.membershipTierHandle)?.handle ||
            membershipTiers[0]?.handle ||
            seedData.demoMember.membershipTierHandle,
        }
      : null,
  };
}
