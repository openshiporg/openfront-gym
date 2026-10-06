"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { keystoneClient } from "@/features/dashboard/lib/keystoneClient";
import { localTimeToUtc, normalizeTimeZone } from "@/lib/timezone";

export async function loadTrainingWorkspace(skip = 0) {
  const response = await keystoneClient<{ trainingWorkspace: any }>(`query TrainingWorkspace($skip: Int!) { trainingWorkspace(skip: $skip) }`, { skip });
  if (!response.success) throw new Error(response.error);
  return { ...response.data.trainingWorkspace, asOf: Date.now() };
}
function dateValue(value: string, timeZone: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) throw new Error("Choose a valid local date and time");
  const [, y, m, d, h = "12", min = "00"] = match;
  return localTimeToUtc({ year: Number(y), month: Number(m), day: Number(d), hour: Number(h), minute: Number(min) }, normalizeTimeZone(timeZone)).toISOString();
}
export async function trainingAction(form: FormData): Promise<void> {
  const path = form.get("surface") === "member" ? "/account/training" : "/dashboard/platform/training";
  let message = "Saved";
  try {
    const operation = String(form.get("operation") || "");
    const timeZone = String(form.get("timeZone") || "UTC");
    const text = (key: string) => String(form.get(key) || "");
    const numeric = (key: string) => Number(text(key));
    const date = (key: string) => dateValue(text(key), timeZone);
    const operations: Record<string, { query: string; variables: Record<string, unknown> }> = {
      book: { query: `mutation BookTraining($data: JSON!) { bookTrainerAppointment(data: $data) }`, variables: { data: { memberId: text("memberId"), instructorId: text("instructorId"), locationId: text("locationId"), resourceId: text("resourceId") || null, trainingPackageId: text("trainingPackageId"), startTime: date("startTime"), memberNotes: text("memberNotes"), idempotencyKey: text("requestKey") } } },
      reschedule: { query: `mutation RescheduleTraining($data: JSON!) { rescheduleTrainerAppointment(data: $data) }`, variables: { data: { appointmentId: text("appointmentId"), instructorId: text("instructorId") || undefined, startTime: date("startTime"), idempotencyKey: text("requestKey"), reason: text("reason") } } },
      transition: { query: `mutation TransitionTraining($appointmentId: ID!, $status: String!, $reason: String) { transitionTrainerAppointment(appointmentId: $appointmentId, status: $status, reason: $reason) }`, variables: { appointmentId: text("appointmentId"), status: text("status"), reason: text("reason") } },
      package: { query: `mutation RecordTraining($data: JSON!) { recordTrainingPackage(data: $data) }`, variables: { data: { memberId: text("memberId"), locationId: text("locationId"), serviceName: text("serviceName"), amount: numeric("amount"), currencyCode: "USD", totalCredits: numeric("totalCredits"), durationMinutes: numeric("durationMinutes"), purchasedAt: date("purchasedAt"), expiresAt: date("expiresAt"), purchaseReference: text("purchaseReference") } } },
      refund: { query: `mutation RefundTraining($data: JSON!) { refundTrainingPackage(data: $data) }`, variables: { data: { packageId: text("packageId"), amount: numeric("amount"), refundReference: text("refundReference") } } },
      availability: { query: `mutation Availability($data: JSON!) { saveTrainerAvailability(data: $data) }`, variables: { data: { id: text("id") || null, instructorId: text("instructorId"), locationId: text("locationId"), type: text("type"), dayOfWeek: numeric("dayOfWeek"), date: date("date"), startTime: text("fromTime"), endTime: text("toTime"), isAvailable: text("type") !== "time_off", reason: text("reason") } } },
      coaching: { query: `mutation AssignCoaching($data: JSON!) { assignCoaching(data: $data) }`, variables: { data: { memberId: text("memberId"), instructorId: text("instructorId"), title: text("title"), instructions: text("instructions"), dueAt: date("dueAt"), requestKey: text("requestKey") } } },
      progress: { query: `mutation CoachingProgress($data: JSON!) { transitionCoaching(data: $data) }`, variables: { data: { id: text("id"), status: text("status"), text: text("text") } } },
      lead: { query: `mutation TrainingLead($data: JSON!) { saveTrainingLead(data: $data) }`, variables: { data: { name: text("name"), email: text("email"), source: text("source"), note: text("note"), status: text("status"), trialAt: date("trialAt"), nextActionAt: date("nextActionAt"), memberId: text("memberId") || null } } },
    };
    const selected = operations[operation];
    if (!selected) throw new Error("Unknown training action");
    const response = await keystoneClient(selected.query, selected.variables);
    if (!response.success) throw new Error(response.error);
  } catch (error) { message = error instanceof Error ? error.message : "Unable to save training action"; redirect(`${path}?error=${encodeURIComponent(message)}`); }
  revalidatePath("/dashboard/platform/training"); revalidatePath("/account/training");
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}
