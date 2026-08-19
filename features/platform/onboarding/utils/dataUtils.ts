import { GYM_TEMPLATES, type SetupTemplate } from '../config/templates';

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

export function getItemsFromJsonData(jsonData: any, sectionType: string): string[] {
  if (!jsonData) return [];
  switch (sectionType) {
    case 'gymSettings':
      return jsonData.gymSettings?.name ? [jsonData.gymSettings.name] : [];
    case 'location':
      return jsonData.location?.name ? [jsonData.location.name] : [];
    case 'membershipTiers':
      return (jsonData.membershipTiers || []).map((item: any) => item.name || 'Unknown Plan');
    case 'classTypes':
      return (jsonData.classTypes || []).map((item: any) => item.name || 'Unknown Class');
    case 'instructors':
      return (jsonData.instructors || []).map((item: any) =>
        `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown Instructor'
      );
    case 'schedules':
      return (jsonData.schedules || []).map((item: any) => formatScheduleDisplayName(item));
    case 'paymentProviders':
      return (jsonData.paymentProviders || []).map(
        (item: any) => `${item.name || item.code || 'Payment provider'} integration status (enabled only with server credentials)`,
      );
    default:
      return [];
  }
}

export function getSeedForTemplate(template: SetupTemplate, seedData: any) {
  const selected = GYM_TEMPLATES[template];
  const membershipTiers = (seedData.membershipTiers as any[]).filter((item) =>
    selected.membershipTiers.includes(item.handle),
  );
  const classTypes = (seedData.classTypes as any[]).filter((item) =>
    selected.classTypes.includes(item.handle),
  );
  const instructors = (seedData.instructors as any[]).filter((item) =>
    selected.instructors.includes(item.handle),
  );
  const classTypeHandles = new Set(classTypes.map((item) => item.handle));
  const instructorHandles = new Set(instructors.map((item) => item.handle));

  return {
    gymSettings: seedData.gymSettings,
    location: seedData.location,
    membershipTiers,
    classTypes,
    instructors,
    schedules: (seedData.schedules as any[]).filter(
      (item) => classTypeHandles.has(item.classTypeHandle) && instructorHandles.has(item.instructorHandle),
    ),
    paymentProviders: seedData.paymentProviders || [],
  };
}
