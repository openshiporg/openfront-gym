import { operationKey } from "./operational-notices";
import * as internalOrigin from "./internal-origin";

// Booking and membership confirmation emails, sent AFTER the committing transaction.
// The OperationalNotice row (unique key per organization + event) is the dedupe record. It is created
// already resolved, so it never appears in the staff follow-up queue; message carries the delivery
// status (sent | failed | skipped_not_configured | skipped_no_recipient) and history the detail.
// A mail failure is recorded and never surfaces: the booking or membership is already committed.

export type ConfirmationMail = { to: string; subject: string; heading: string; lines: string[]; link: { url: string; label: string } };
type Send = (mail: ConfirmationMail) => Promise<{ sent: boolean; error?: string; messageId?: string; response?: string }>;

async function claim(prisma: any, input: { organizationId: string; memberId?: string | null; key: string; kind: string }) {
  try {
    return await prisma.operationalNotice.create({
      data: { organizationId: input.organizationId, memberId: input.memberId || null, key: operationKey(input.organizationId, input.key), kind: input.kind, message: "sending", status: "resolved", resolvedAt: new Date(), history: [] },
      select: { id: true },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return null; // already claimed: replay or concurrent completion
    throw error;
  }
}

async function record(prisma: any, id: string, status: string, error?: string, messageId?: string, response?: string) {
  await prisma.operationalNotice.update({ where: { id }, data: { message: status, history: [{ action: "confirmation-email", status, at: new Date().toISOString(), ...(messageId ? { messageId: messageId.slice(0, 200) } : {}), ...(response ? { smtpResponse: response.slice(0, 300) } : {}), ...(error ? { error: error.slice(0, 200) } : {}) }] } });
}

async function deliver(prisma: any, input: { organizationId: string; memberId?: string | null; key: string; kind: string; to: string; build: () => ConfirmationMail }, send?: Send) {
  try {
    const notice = await claim(prisma, input);
    if (!notice) return;
    try {
      if (!input.to) { await record(prisma, notice.id, "skipped_no_recipient"); return; }
      const mail = await import("./mail");
      if (!mail.mailDeliveryEnabled()) { await record(prisma, notice.id, "skipped_not_configured"); return; }
      const sender: Send = send || (await import("./confirmation-mail")).sendConfirmationMail;
      const result = await sender(input.build());
      await (result.sent ? record(prisma, notice.id, "sent", undefined, result.messageId, result.response) : record(prisma, notice.id, "failed", result.error || "send_failed"));
    } catch (error) {
      try { await record(prisma, notice.id, "failed", error instanceof Error ? error.message : "send_failed"); } catch { /* the booking is committed; bookkeeping must never surface */ }
    }
  } catch (error) {
    console.error("Confirmation email bookkeeping failed:", error instanceof Error ? error.message : "unknown");
  }
}

const when = (value: Date | string, timeZone: string) => new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));

export async function deliverBookingConfirmation(prisma: any, bookingId: string, send?: Send) {
  try {
    const booking = await prisma.classBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, organizationId: true, memberId: true, memberName: true, memberEmail: true, status: true, waitlistPosition: true,
        organization: { select: { name: true, timezone: true } },
        classInstance: { select: { date: true, location: { select: { name: true } }, classSchedule: { select: { name: true, location: { select: { name: true } } } } } } },
    });
    if (!booking) return;
    await deliver(prisma, {
      organizationId: booking.organizationId, memberId: booking.memberId, key: `confirmation-email:booking:${booking.id}`, kind: "confirmation_email", to: booking.memberEmail,
      build: () => {
        const zone = booking.organization?.timezone || "UTC";
        const name = booking.classInstance?.classSchedule?.name || "your class";
        const place = booking.classInstance?.location?.name || booking.classInstance?.classSchedule?.location?.name;
        const waitlisted = booking.status === "waitlist";
        const publicAppUrl = (path: string) => internalOrigin.publicAppUrl(path);
        return {
          to: booking.memberEmail,
          subject: `${waitlisted ? "You are on the waitlist for" : "Booked:"} ${name} at ${booking.organization?.name || "the club"}`,
          heading: waitlisted ? `You are on the waitlist for ${name}` : `You are booked into ${name}`,
          lines: [when(booking.classInstance.date, zone), ...(place ? [place] : []), ...(waitlisted ? [`Waitlist position ${booking.waitlistPosition ?? ""}. A released place is confirmed automatically.`.trim()] : ["We'll email you a reminder the day before."])],
          link: { url: publicAppUrl("/account/bookings"), label: "View your bookings" },
        };
      },
    }, send);
  } catch (error) {
    console.error("Booking confirmation email failed:", error instanceof Error ? error.message : "unknown");
  }
}

/** First paid invoice of a new membership: the signed-in member's own account page is the link (members always have an account). */
export async function deliverMembershipConfirmation(prisma: any, input: { organizationId: string; stripeSubscriptionId: string; invoiceId: string; amountCents: number; currencyCode: string }, send?: Send) {
  try {
    const membership = await prisma.membership.findFirst({
      where: { organizationId: input.organizationId, stripeSubscriptionId: input.stripeSubscriptionId },
      select: { id: true, billingCycle: true, tier: { select: { name: true } }, organization: { select: { name: true } }, member: { select: { id: true, email: true, name: true } } },
    });
    if (!membership) return;
    const memberRow = membership.member ? await prisma.member.findFirst({ where: { organizationId: input.organizationId, userId: membership.member.id }, select: { id: true } }) : null;
    await deliver(prisma, {
      organizationId: input.organizationId, memberId: memberRow?.id ?? null, key: `confirmation-email:membership:${input.invoiceId}`, kind: "confirmation_email", to: membership.member?.email || "",
      build: () => {
        const publicAppUrl = (path: string) => internalOrigin.publicAppUrl(path);
        const paid = new Intl.NumberFormat("en-US", { style: "currency", currency: input.currencyCode || "USD" }).format(input.amountCents / 100);
        return {
          to: membership.member!.email,
          subject: `Welcome to ${membership.organization?.name || "the club"}: your membership is active`,
          heading: `Your ${membership.tier?.name || ""} membership is active`.replace("  ", " "),
          lines: [`${membership.billingCycle === "annual" ? "Annual" : "Monthly"} billing, first payment ${paid}.`],
          link: { url: publicAppUrl("/account/membership"), label: "View your membership" },
        };
      },
    }, send);
  } catch (error) {
    console.error("Membership confirmation email failed:", error instanceof Error ? error.message : "unknown");
  }
}

/** Hours before class that the reminder email goes out (Mindbody/ClassPass default). */
export const CLASS_REMINDER_HOURS = 24;

/**
 * Sends one reminder per confirmed booking for classes starting within the next CLASS_REMINDER_HOURS.
 * Bookings made inside that window are skipped: their confirmation email already carries the time.
 * The per-booking OperationalNotice claim makes every pass and every replica safe to repeat.
 */
export async function sendDueClassReminders(prisma: any, now = new Date(), send?: Send) {
  const until = new Date(now.getTime() + CLASS_REMINDER_HOURS * 3_600_000);
  const due = await prisma.classBooking.findMany({
    where: {
      status: "confirmed",
      memberEmail: { not: "" },
      bookedAt: { lt: new Date(now.getTime() - 3_600_000) },
      classInstance: { date: { gt: now, lte: until }, isCancelled: false },
      organization: { status: "active" },
    },
    select: { id: true, organizationId: true, memberId: true, memberEmail: true, bookedAt: true,
      organization: { select: { name: true, timezone: true } },
      classInstance: { select: { date: true, location: { select: { name: true } }, classSchedule: { select: { name: true, location: { select: { name: true } } } } } } },
    orderBy: { bookedAt: "asc" },
    take: 100,
  });
  let attempted = 0;
  for (const booking of due) {
    const start = new Date(booking.classInstance.date);
    // Booked less than a day out: the confirmation was the reminder.
    if (start.getTime() - new Date(booking.bookedAt).getTime() < CLASS_REMINDER_HOURS * 3_600_000) continue;
    attempted += 1;
    await deliver(prisma, {
      organizationId: booking.organizationId, memberId: booking.memberId, key: `class-reminder:booking:${booking.id}`, kind: "confirmation_email", to: booking.memberEmail,
      build: () => {
        const zone = booking.organization?.timezone || "UTC";
        const name = booking.classInstance?.classSchedule?.name || "your class";
        const place = booking.classInstance?.location?.name || booking.classInstance?.classSchedule?.location?.name;
        return {
          to: booking.memberEmail,
          subject: `Reminder: ${name} at ${booking.organization?.name || "the club"}`,
          heading: `See you at ${name}`,
          lines: [when(start, zone), ...(place ? [place] : []), "Can't make it? Cancel from your bookings so someone on the waitlist gets your place."],
          link: { url: internalOrigin.publicAppUrl("/account/bookings"), label: "View or cancel your booking" },
        };
      },
    }, send);
  }
  return { attempted };
}
