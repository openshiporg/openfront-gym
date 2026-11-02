function escapeText(value: unknown) { return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function instant(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('Calendar event date is invalid'); return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
/** RFC 5545 folds are measured in UTF-8 octets, not JS code units. */
function fold(line: string) {
  const lines: string[] = []; let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > 75) { lines.push(current); current = ' '; }
    current += char;
  }
  lines.push(current); return lines.join('\r\n');
}
export function serializeClassCalendar(feed: { organizationId: string; classes: any[] }, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Openfront Gym//Class Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const entry of feed.classes.slice(0, 200)) {
    // Legacy occurrences without a persisted end are not published with an invented duration.
    if (!entry.endsAt || new Date(entry.endsAt) <= new Date(entry.startsAt)) continue;
    lines.push('BEGIN:VEVENT', `UID:${escapeText(`${feed.organizationId}-${entry.instanceId}@openfront-gym`)}`, `DTSTAMP:${instant(now.toISOString())}`, `DTSTART:${instant(entry.startsAt)}`, `DTEND:${instant(entry.endsAt)}`, `SUMMARY:${escapeText(entry.schedule?.name || 'Gym class')}`, `DESCRIPTION:${escapeText(entry.schedule?.description || '')}`, `LOCATION:${escapeText(entry.location?.name || '')}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR'); return `${lines.map(fold).join('\r\n')}\r\n`;
}
