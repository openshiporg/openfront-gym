type Window = { start: number; end: number } | 'all' | 'closed';
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function minute(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) throw new Error('Access hours need a supported time range; ask staff to review the policy');
  let hour = Number(match[1]);
  if (match[3]) {
    if (hour < 1 || hour > 12) throw new Error('Access hours have an invalid clock hour');
    hour = hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  } else if (hour > 23 || !match[2]) throw new Error('Use HH:mm for 24-hour access times');
  return hour * 60 + Number(match[2] || 0);
}

export function parseAccessWindow(value: unknown): Window {
  if (typeof value !== 'string') throw new Error('Access hours are not configured; staff review is required');
  const normalized = value.trim().toLowerCase();
  if (normalized === '24/7' || normalized === '24 hours') return 'all';
  if (normalized === 'closed') return 'closed';
  const range = normalized.split(/\s*[-–—]\s*/);
  if (range.length !== 2) throw new Error('Access hours need a supported time range; staff review is required');
  const start = minute(range[0]); const end = minute(range[1]);
  if (start === end) throw new Error('Equal access opening and closing times are ambiguous; use 24/7 or Closed');
  return { start, end };
}

function localClock(at: Date, timezone: string) {
  if (!Number.isFinite(at.getTime()) || !timezone) throw new Error('A valid facility timezone and admission time are required');
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at); }
  catch { throw new Error('Facility timezone is invalid; staff review is required'); }
  const get = (name: string) => parts.find(part => part.type === name)?.value || '';
  return { day: get('weekday').toLowerCase(), minute: Number(get('hour')) * 60 + Number(get('minute')) };
}
function includes(window: Window, current: number) {
  if (window === 'all') return true;
  if (window === 'closed') return false;
  return window.start < window.end ? current >= window.start && current < window.end : current >= window.start || current < window.end;
}

export function isWithinOperatingHours(hours: unknown, at: Date, timezone: string) {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) throw new Error('Facility operating hours are not configured; staff review is required');
  const clock = localClock(at, timezone);
  const daily = Object.fromEntries(Object.entries(hours).map(([key, value]) => [key.toLowerCase(), value]));
  const today = parseAccessWindow(daily[clock.day]);
  const previousDay = weekdays[(weekdays.indexOf(clock.day) + 6) % 7];
  const previous = parseAccessWindow(daily[previousDay]);
  // An overnight interval is attached to its opening day. Today's early
  // morning can only be admitted by yesterday's overnight interval.
  const todayOpen = today === 'all' || (today !== 'closed' && (today.start < today.end ? clock.minute >= today.start && clock.minute < today.end : clock.minute >= today.start));
  const overnightCarry = previous !== 'all' && previous !== 'closed' && previous.start > previous.end && clock.minute < previous.end;
  return todayOpen || overnightCarry;
}

export function membershipAccessWindow(agreement: any): Window {
  const published = typeof agreement?.accessHours === 'string' ? agreement.accessHours.trim().toLowerCase() : '';
  // The public text is the primary policy. The legacy JSON field supplies a
  // detailed range for 'limited' or blank text, not a hidden second restriction.
  if (published === 'staffed hours') return 'all';
  if (published && published !== 'limited') return parseAccessWindow(published);
  const configuration = agreement?.accessHoursJson;
  if (configuration?.type === '24/7') return 'all';
  if (configuration?.hours) return parseAccessWindow(configuration.hours);
  if (published === 'limited' || configuration?.type === 'limited') return { start: 6 * 60, end: 22 * 60 };
  throw new Error('Membership access hours are unknown; staff review is required');
}

/** Facility admission only; scheduled class delivery uses its explicit schedule. */
export async function assertFacilityAccessHours(tx: any, organizationId: string, membership: any | null, at: Date) {
  if (!organizationId || (membership && membership.organizationId !== organizationId)) throw new Error('Facility admission organization mismatch');
  const settings = await tx.gymSettings.findMany({ where: { organizationId }, take: 2, select: { timezone: true, hours: true } });
  if (settings.length !== 1) throw new Error('Facility operating configuration requires staff review');
  const organization = settings[0].timezone ? null : await tx.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  const timezone = settings[0].timezone || organization?.timezone;
  if (!isWithinOperatingHours(settings[0].hours, at, timezone)) throw new Error('The facility is closed at this admission time');
  if (!membership) return;
  const agreement = membership.agreementSnapshot?.version ? membership.agreementSnapshot :
    membership.tier || await tx.membershipTier.findFirst({ where: { id: membership.tierId, organizationId }, select: { accessHours: true, accessHoursJson: true } });
  if (!includes(membershipAccessWindow(agreement), localClock(at, timezone).minute)) throw new Error('This admission is outside the membership access hours');
}
