"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { gymGraphql as keystoneClient } from "@/features/platform/lib/gym-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";
import { exactLocalTimeToUtc, normalizeTimeZone } from "@/lib/timezone";
import { openStaffIntent, settleStaffIntent } from "@/features/platform/lib/staff-intent";

export async function loadTrainingWorkspace(options: { skip?: number; cardSkip?: number; availabilitySkip?: number; memberQuery?: string } = {}) {
  const bound = (value?: number) => Number.isSafeInteger(value) ? Math.min(Math.max(0, value as number), 100_000) : 0;
  const response = await keystoneClient<{ trainingWorkspace: any }>(
    `query TrainingWorkspace($skip: Int!, $cardSkip: Int!, $availabilitySkip: Int!, $memberQuery: String) { trainingWorkspace(skip: $skip, cardSkip: $cardSkip, availabilitySkip: $availabilitySkip, memberQuery: $memberQuery) }`,
    { skip: bound(options.skip), cardSkip: bound(options.cardSkip), availabilitySkip: bound(options.availabilitySkip), memberQuery: (options.memberQuery || "").slice(0, 100) || null },
  );
  if (!response.success) throw new Error(response.error);
  return { ...response.data.trainingWorkspace, asOf: Date.now() };
}
function dateValue(value: string, timeZone: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) throw new Error("Choose a valid local date and time");
  const [, y, m, d, h = "12", min = "00"] = match;
  return exactLocalTimeToUtc({ year: Number(y), month: Number(m), day: Number(d), hour: Number(h), minute: Number(min) }, normalizeTimeZone(timeZone)).toISOString();
}
export async function trainingAction(submitted: FormData): Promise<void> {
  const path = submitted.get("surface") === "member" ? "/account/training" : "/dashboard/platform/training";
  let message = "Saved";
  let checkoutUrl: string | null = null;
  let intentId = "";
  try {
    // The request is recorded before it is sent; a retry resends exactly that record.
    const intent = await openStaffIntent("training", submitted);
    intentId = intent.id;
    const form = intent.form;
    const operation = String(form.get("operation") || "");
    const timeZone = String(form.get("timeZone") || "UTC");
    const text = (key: string) => String(form.get(key) || "");
    const numeric = (key: string) => Number(text(key));
    const date = (key: string) => dateValue(text(key), timeZone);
    // A blank weekday stays blank so the server can reject it instead of reading Sunday.
    const weekday = text("dayOfWeek") === "" ? null : numeric("dayOfWeek");
    // Effective bounds cover whole local days.
    const bound = (key: string, time: string) => text(key) ? dateValue(`${text(key)}T${time}`, timeZone) : null;
    const operations: Record<string, { query: string; variables: Record<string, unknown> }> = {
      book: { query: `mutation BookTraining($data: JSON!) { bookTrainerAppointment(data: $data) }`, variables: { data: { instructorId: text("instructorId"), resourceId: text("resourceId") || null, trainingPackageId: text("trainingPackageId"), startTime: date("startTime"), memberNotes: text("memberNotes"), idempotencyKey: text("requestKey") } } },
      reschedule: { query: `mutation RescheduleTraining($data: JSON!) { rescheduleTrainerAppointment(data: $data) }`, variables: { data: { appointmentId: text("appointmentId"), instructorId: text("instructorId") || undefined, startTime: date("startTime"), idempotencyKey: text("requestKey"), reason: text("reason") } } },
      transition: { query: `mutation TransitionTraining($appointmentId: ID!, $status: String!, $reason: String) { transitionTrainerAppointment(appointmentId: $appointmentId, status: $status, reason: $reason) }`, variables: { appointmentId: text("appointmentId"), status: text("status"), reason: text("reason") } },
      package: { query: `mutation RecordTraining($data: JSON!) { recordTrainingPackage(data: $data) }`, variables: { data: { requestKey: text("requestKey"), memberId: text("memberId"), locationId: text("locationId"), serviceName: text("serviceName"), amount: numeric("amount"), currencyCode: "USD", totalCredits: numeric("totalCredits"), durationMinutes: numeric("durationMinutes"), purchasedAt: date("purchasedAt"), expiresAt: date("expiresAt"), purchaseReference: text("purchaseReference") } } },
      refund: { query: `mutation RefundTraining($data: JSON!) { refundTrainingPackage(data: $data) }`, variables: { data: { requestKey: text("requestKey"), packageId: text("packageId"), amount: numeric("amount"), refundReference: text("refundReference") } } },
      availability: { query: `mutation Availability($data: JSON!) { saveTrainerAvailability(data: $data) }`, variables: { data: { requestKey: text("requestKey"), id: text("id") || null, instructorId: text("instructorId"), locationId: text("locationId"), type: text("type"), dayOfWeek: weekday, date: date("date"), effectiveFrom: bound("effectiveFrom", "00:00"), effectiveTo: bound("effectiveTo", "23:59"), startTime: text("fromTime"), endTime: text("toTime"), isAvailable: text("type") !== "time_off", reason: text("reason") } } },
      coaching: { query: `mutation AssignCoaching($data: JSON!) { assignCoaching(data: $data) }`, variables: { data: { memberId: text("memberId"), instructorId: text("instructorId"), title: text("title"), instructions: text("instructions"), dueAt: date("dueAt"), requestKey: text("requestKey") } } },
      progress: { query: `mutation CoachingProgress($data: JSON!) { transitionCoaching(data: $data) }`, variables: { data: { id: text("id"), status: text("status"), text: text("text") } } },
      lead: { query: `mutation TrainingLead($data: JSON!) { saveTrainingLead(data: $data) }`, variables: { data: { name: text("name"), email: text("email"), source: text("source"), note: text("note"), status: text("status"), trialAt: date("trialAt"), nextActionAt: date("nextActionAt"), memberId: text("memberId") || null } } },
    };
    const startCard = operation === "package" && form.get("cardCheckout") === "yes";
    const selected = startCard
      ? { query: `mutation StartCardTraining($data: JSON!) { recordTrainingPackage(data: $data) }`, variables: { data: { mode: "startCard", memberId: text("memberId"), locationId: text("locationId"), serviceName: text("serviceName"), amount: numeric("amount"), totalCredits: numeric("totalCredits"), durationMinutes: numeric("durationMinutes"), expiresAt: date("expiresAt"), requestKey: text("requestKey") } } }
      : operations[operation];
    if (!selected) throw new Error("Unknown training action");
    const response = await keystoneClient<Record<string, any>>(selected.query, selected.variables);
    if (!response.success) throw new Error(staffActionError(response, "Unable to save training action. Refresh and try again."));
    if (startCard) {
      checkoutUrl = response.data.recordTrainingPackage?.checkoutUrl || null;
      if (!checkoutUrl) throw new Error("Card checkout could not be opened. Try again.");
    }
    if (operation === "book") message = "Session reserved";
    await settleStaffIntent(intentId, "succeeded");
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to save training action";
    const status = intentId ? await settleStaffIntent(intentId, "failed", message) : "unknown";
    // The server confirmed this exact request although its response didn't arrive.
    if (status === "succeeded") redirect(`${path}?success=${encodeURIComponent("Saved. The confirmation arrived late, so nothing was repeated.")}`);
    redirect(`${path}?error=${encodeURIComponent(message)}${intentId ? `&intent=${encodeURIComponent(intentId)}` : ""}`);
  }
  // Staff hand the counter device to the customer; Stripe returns with the checkout id.
  if (checkoutUrl) redirect(checkoutUrl);
  revalidatePath("/dashboard/platform/training"); revalidatePath("/account/training");
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}
