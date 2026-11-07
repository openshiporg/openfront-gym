/**
 * Every lifecycle the gym enforces, as data: one transitions map per machine and one guard used by
 * every writer (Keystone hooks, mutations, webhooks, jobs). A status not in its map is unknown,
 * a status with an empty set is terminal. Staying in the same status is always a no-op.
 */
export type Machine = Readonly<Record<string, ReadonlySet<string>>>;

const m = (table: Record<string, string[]>): Machine =>
  Object.fromEntries(Object.entries(table).map(([from, to]) => [from, new Set(to)]));

/**
 * Membership. Provider events drive most moves. `expired` (paid period ran out) comes back when a
 * renewal is paid. `cancelled` is final for the row's agreement: no provider event, billing
 * operation or timer revives it. A rejoin is a new accepted agreement (provision-membership), which
 * is the only writer allowed to leave an ended status.
 */
export const MEMBERSHIP_MACHINE = m({
  active: ["frozen", "cancelled", "expired", "past-due"],
  frozen: ["active", "cancelled", "expired", "past-due"],
  "past-due": ["active", "frozen", "cancelled", "expired"],
  expired: ["active", "frozen", "past-due", "cancelled"],
  cancelled: [],
});

/** The payment-provider's view of a subscription, projected locally. `cancelled` is final. */
export const SUBSCRIPTION_MACHINE = m({
  active: ["paused", "past_due", "cancelled"],
  paused: ["active", "past_due", "cancelled"],
  past_due: ["active", "paused", "cancelled"],
  cancelled: [],
});

export const BOOKING_MACHINE = m({
  confirmed: ["cancelled"],
  waitlist: ["confirmed", "cancelled"],
  cancelled: [],
});

export const MEMBER_ACCOUNT_MACHINE = m({
  active: ["suspended", "cancelled"],
  suspended: ["active", "cancelled"],
  cancelled: [],
});

export const GIFT_CARD_MACHINE = m({
  active: ["redeemed", "voided"],
  redeemed: [],
  voided: [],
});

export const TRAINING_LEAD_MACHINE = m({
  new: ["contacted", "closed"],
  contacted: ["trial_booked", "converted", "closed"],
  trial_booked: ["trial_attended", "contacted", "closed"],
  trial_attended: ["converted", "contacted", "closed"],
  converted: [],
  closed: [],
});

export const COACHING_MACHINE = m({
  assigned: ["submitted", "cancelled"],
  submitted: ["reviewed"],
  reviewed: [],
  cancelled: [],
});

export const TRAINING_PACKAGE_MACHINE = m({
  active: ["refunded"],
  refunded: [],
});

/** Checkout sessions (membership, drop-in, gift card). `completed`, `expired`, `cancelled` are final. */
export const PAYMENT_SESSION_MACHINE = m({
  pending: ["processing", "requires_action", "completed", "failed", "expired", "cancelled"],
  processing: ["requires_action", "completed", "failed", "expired", "cancelled"],
  requires_action: ["processing", "completed", "failed", "expired", "cancelled"],
  failed: ["processing", "requires_action", "expired"],
  completed: [],
  expired: [],
  cancelled: [],
});

export function canTransition(machine: Machine, from: string, to: string) {
  if (from === to) return true;
  return Boolean(machine[from]?.has(to));
}

export function assertTransition(machine: Machine, label: string, from: string, to: string) {
  if (!Object.hasOwn(machine, from)) throw new Error(`Unknown ${label} status: ${from}`);
  if (!Object.hasOwn(machine, to)) throw new Error(`Unknown ${label} status: ${to}`);
  if (!canTransition(machine, from, to)) throw new Error(`Invalid ${label} status transition: ${from} -> ${to}`);
}

/**
 * For writers that must not fail (a provider webhook that would otherwise be retried forever):
 * the incoming status when the move is legal, otherwise the status the record already has.
 */
export function settleTransition(machine: Machine, from: string | null | undefined, to: string) {
  if (!from || !Object.hasOwn(machine, from)) return to;
  return canTransition(machine, from, to) ? to : from;
}
