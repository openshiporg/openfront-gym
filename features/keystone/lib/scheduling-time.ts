const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function scheduleDurationMinutes(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime || !TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return 60;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return duration > 0 ? duration : 60;
}
