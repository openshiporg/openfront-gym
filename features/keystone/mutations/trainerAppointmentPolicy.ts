export const ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "confirmed", "checked_in"] as const;
export const APPOINTMENT_STATUSES = [
  ...ACTIVE_APPOINTMENT_STATUSES,
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["confirmed", "checked_in", "completed", "cancelled", "no_show"],
  confirmed: ["checked_in", "completed", "cancelled", "no_show"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function normalizeAppointmentWindow(start: Date, durationMinutes: number) {
  if (!(start instanceof Date) || !Number.isFinite(start.getTime())) {
    throw new Error("Appointment start time is invalid");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error("Appointment duration must be an integer between 15 and 480 minutes");
  }
  return {
    startTime: start,
    endTime: new Date(start.getTime() + durationMinutes * 60_000),
    durationMinutes,
  };
}

export function assertAppointmentTransition(from: string, to: string) {
  if (!APPOINTMENT_STATUSES.includes(from as AppointmentStatus)) {
    throw new Error(`Unknown appointment status: ${from}`);
  }
  if (!APPOINTMENT_STATUSES.includes(to as AppointmentStatus)) {
    throw new Error(`Unknown appointment status: ${to}`);
  }
  if (from === to) return;
  if (!TRANSITIONS[from as AppointmentStatus].includes(to as AppointmentStatus)) {
    throw new Error(`Appointment transition ${from} -> ${to} is not allowed`);
  }
}

export function buildActiveAppointmentOverlapWhere(startTime: Date, endTime: Date) {
  return {
    startTime: { lt: endTime },
    endTime: { gt: startTime },
    status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
  };
}
