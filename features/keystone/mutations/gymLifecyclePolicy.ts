const MEMBERSHIP_TRANSITIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  active: new Set(["frozen", "cancelled", "expired", "past-due"]),
  frozen: new Set(["active", "cancelled", "expired", "past-due"]),
  "past-due": new Set(["active", "frozen", "cancelled", "expired"]),
  cancelled: new Set(),
  expired: new Set(),
};

const BOOKING_TRANSITIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  confirmed: new Set(["cancelled"]),
  waitlist: new Set(["confirmed", "cancelled"]),
  cancelled: new Set(),
};

export type AttendanceOutcome = "attended" | "late" | "no-show";
export type CheckInMethod = "qr_code" | "rfid" | "manual" | "app";

export function assertMembershipStatusTransition(previous: string, next: string) {
  if (previous === next) return;
  if (!MEMBERSHIP_TRANSITIONS[previous]?.has(next)) {
    throw new Error(`Invalid membership status transition: ${previous} -> ${next}`);
  }
}

export function assertBookingStatusTransition(previous: string, next: string) {
  if (previous === next) return;
  if (!BOOKING_TRANSITIONS[previous]?.has(next)) {
    throw new Error(`Invalid booking status transition: ${previous} -> ${next}`);
  }
}

export function normalizeAttendanceOutcome(value: unknown): AttendanceOutcome {
  if (value === "attended" || value === "late" || value === "no-show") return value;
  throw new Error("Attendance outcome must be attended, late, or no-show");
}

export function normalizeCheckInMethod(value: unknown): CheckInMethod {
  if (value === "qr_code" || value === "rfid" || value === "manual" || value === "app") {
    return value;
  }
  throw new Error("Check-in method is not supported");
}

function addPolicyError(addValidationError: (message: string) => void, operation: () => void) {
  try {
    operation();
  } catch (error) {
    addValidationError(error instanceof Error ? error.message : String(error));
  }
}

export const membershipLifecycleHooks = {
  validateInput({ operation, item, resolvedData, addValidationError }: any) {
    if (operation !== "update" || !item || resolvedData.status === undefined) return;
    addPolicyError(addValidationError, () =>
      assertMembershipStatusTransition(item.status, resolvedData.status)
    );
  },
};

export const bookingLifecycleHooks = {
  validateInput({ operation, item, resolvedData, addValidationError }: any) {
    if (operation !== "update" || !item || resolvedData.status === undefined) return;
    addPolicyError(addValidationError, () =>
      assertBookingStatusTransition(item.status, resolvedData.status)
    );
  },
};
