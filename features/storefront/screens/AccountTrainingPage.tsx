import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ClipboardList, Dumbbell } from "lucide-react";
import { getUser } from "../lib/data/user";
import { loadTrainingWorkspace, trainingAction } from "@/features/platform/training/actions/training";
import SubmitButton from "../modules/common/submit-button";
import { isTrainingPackageSelectable, trainingPackageDisplayStatus } from "@/features/platform/training/lib/package-availability";
import { clubDateParts, humanizeLabel } from "@/features/storefront/lib/presentation";
import { ArrowLink, Banner, EmptyState } from "@/features/storefront/modules/common/ui";
import { contactPath } from "@/features/storefront/lib/contact-config";
import { retryIntentFor, retryKeyFor, type RetryDraft } from "@/features/platform/lib/retry-draft";
import { loadRetryIntent } from "@/features/platform/lib/staff-intent";
import { discardStaffIntentAction } from "@/features/platform/lib/intent-actions";

const TRAINING_CONTACT = contactPath("training", "/account/training");

/** Monday-first display order for the Sunday-indexed `dayOfWeek` stored on trainer availability. */
const WEEK = [
  { index: 1, short: "Mon", long: "Monday" },
  { index: 2, short: "Tue", long: "Tuesday" },
  { index: 3, short: "Wed", long: "Wednesday" },
  { index: 4, short: "Thu", long: "Thursday" },
  { index: 5, short: "Fri", long: "Friday" },
  { index: 6, short: "Sat", long: "Saturday" },
  { index: 0, short: "Sun", long: "Sunday" },
];

function Field({ name, label, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="sf-field">{label}<input name={name} type={type} required={required} maxLength={type === "text" ? 2000 : undefined} /></label>;
}
function Choice({ name, label, rows, optional = false }: { name: string; label: string; rows: Array<{ id: string; name: string }>; optional?: boolean }) {
  return <label className="sf-field">{label}<select name={name} required={!optional}><option value="">{optional ? "No preference" : "Choose"}</option>{rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>;
}
function TrainingForm({ operation, scope = "", retry, zone, label, variant = "primary", children }: { operation: string; scope?: string; retry?: RetryDraft; zone: string; label: string; variant?: "primary" | "danger"; children: ReactNode }) {
  // While an earlier request here is unconfirmed, the form resends exactly that request; the
  // customer can discard it only once they know it wasn't recorded.
  const intentId = retryIntentFor(retry, operation, scope);
  if (intentId) {
    return <div className="sf-stack" data-gap="sm">
      <form action={trainingAction} className="sf-form">
        <input type="hidden" name="intentId" value={intentId} />
        <input type="hidden" name="surface" value="member" />
        <p className="sf-hint">Your earlier request wasn’t confirmed. Trying again sends exactly the same request; it is never applied twice.</p>
        <div><SubmitButton variant={variant} pendingLabel="Sending…">Try again</SubmitButton></div>
      </form>
      <form action={discardStaffIntentAction}>
        <input type="hidden" name="intentId" value={intentId} />
        <input type="hidden" name="returnTo" value="/account/training" />
        <button type="submit" className="sf-link">It wasn’t recorded: start over</button>
      </form>
    </div>;
  }
  return <form action={trainingAction} className="sf-form"><input type="hidden" name="operation" value={operation} /><input type="hidden" name="surface" value="member" /><input type="hidden" name="timeZone" value={zone} /><input type="hidden" name="requestKey" value={retryKeyFor(retry, operation, scope, randomUUID)} />{scope ? <input type="hidden" name="retryScope" value={scope} /> : null}{children}<div><SubmitButton variant={variant} pendingLabel="Saving…">{label}</SubmitButton></div></form>;
}

function appointmentTone(status: string) {
  if (status === "scheduled" || status === "confirmed" || status === "checked_in") return "ok";
  if (status === "cancelled" || status === "no_show") return "bad";
  return "neutral";
}
function assignmentTone(status: string) {
  if (status === "assigned") return "accent";
  if (status === "submitted") return "low";
  if (status === "reviewed") return "ok";
  return "neutral";
}
function packageTone(status: string) {
  if (status === "active") return "ok";
  if (status === "refunded") return "bad";
  return "low";
}

export default async function AccountTrainingPage({ searchParams }: { searchParams: Promise<{ skip?: string; error?: string; success?: string; intent?: string }> }) {
  if (!await getUser()) redirect("/account?returnTo=%2Faccount%2Ftraining");
  const params = await searchParams;
  const parsedSkip = Number(params.skip || 0);
  const skip = Number.isFinite(parsedSkip) ? Math.max(0, Math.trunc(parsedSkip)) : 0;
  const [data, retry] = await Promise.all([loadTrainingWorkspace({ skip }), loadRetryIntent(params.intent, "training")]);
  // This is always the customer's workspace, including when their role also has staff permissions.
  const own = (rows: any[]) => rows.filter(row => data.memberId && row.memberId === data.memberId);
  const packages = own(data.packages || []);
  const now = new Date().getTime();
  const appointments = own(data.appointments || []).sort((a,b) => {
    const aPast = Date.parse(a.startTime) < now;
    const bPast = Date.parse(b.startTime) < now;
    return Number(aPast) - Number(bPast) || (aPast ? b.startTime.localeCompare(a.startTime) : a.startTime.localeCompare(b.startTime));
  });
  const assignments = own(data.assignments || []);
  const zone = data.timeZone || "UTC";
  const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(value)) : "Date not available";
  const clock = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(value)) : null;
  const day = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: zone }).format(new Date(value)) : "Date not available";
  const dayKey = (value: string | number) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zone }).format(new Date(value));
  const calendarDate = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: zone }).format(new Date(value)) : "Date not available";
  // Availability stores wall-clock "HH:MM"; show it in the same 12-hour style as the rest of the page.
  const wallClock = (value?: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
    if (!match) return value || "";
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
  };
  const name = (rows: any[], id: string) => rows.find(row => row.id === id)?.name || "Not published";
  const currentPackages = packages.filter(pack => isTrainingPackageSelectable(pack, now));

  const isUpcoming = (row: any) => ["scheduled", "confirmed"].includes(row.status) && Date.parse(row.startTime) > now;

  const availability: any[] = data.availability || [];
  const recurring = availability.filter(row => row.type === "recurring");
  const today = dayKey(now);
  const dated = availability
    .filter(row => row.type !== "recurring" && Number.isFinite(Date.parse(row.date)) && dayKey(row.date) >= today)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  return <>
    <div className="sf-row" data-between>
      <h1 className="sf-h2">Personal training</h1>
      <span className="sf-meta">Times in {zone}</span>
    </div>
    {params.error ? <Banner tone="bad" action={<Link href={TRAINING_CONTACT} className="sf-link">Contact the club</Link>}>{params.error}</Banner> : null}
    {params.success ? <Banner tone="ok">Request saved.</Banner> : null}

    <section className="sf-stack" aria-labelledby="appointments-heading">
      <h2 id="appointments-heading" className="sf-h3">Appointments</h2>
      {!appointments.length ? <EmptyState icon={<CalendarClock aria-hidden="true" />} title="No appointments" action={currentPackages.length ? <a className="sf-link" href="#packages">Book with a package</a> : <ArrowLink href={TRAINING_CONTACT}>Ask about personal training</ArrowLink>} /> : null}
      {appointments.length ? <div className="sf-bookings">{appointments.map(row => {
        const parts = clubDateParts(row.startTime, zone);
        const start = clock(row.startTime);
        const end = clock(row.endTime);
        const changeable = isUpcoming(row);
        return <article className="sf-booking" key={row.id} data-muted={!changeable || undefined}>
          <div className="sf-datebox" aria-hidden="true">{parts ? <><span>{parts.weekday}</span><strong>{parts.day}</strong><span>{parts.month}</span></> : <strong>–</strong>}</div>
          <div className="sf-booking-body">
            <div className="sf-titleline"><h3>{row.serviceName}</h3><span className="sf-state" data-tone={appointmentTone(row.status)}>{humanizeLabel(row.status)}</span></div>
            <p>{start ? `${day(row.startTime)} · ${start}${end ? `–${end}` : ""}` : date(row.startTime)}</p>
            <p>{name(data.instructors, row.instructorId)} · {name(data.locations, row.locationId)}</p>
          </div>
          {(row.cancellationReason || changeable) ? <div className="sf-booking-extra">
            {row.cancellationReason ? <Banner tone="warn">{row.cancellationReason}</Banner> : null}
            {changeable ? <>
              <details className="sf-disclosure"><summary>Change time</summary><div><TrainingForm operation="reschedule" scope={row.id} retry={retry} zone={zone} label="Request new time"><input type="hidden" name="appointmentId" value={row.id} /><Choice name="instructorId" label="Coach" rows={data.instructors} optional /><Field name="startTime" label={`New start (${zone})`} type="datetime-local" /><Field name="reason" label="Reason" /><p className="sf-hint">Your current time stays booked if the new time isn’t available.</p></TrainingForm></div></details>
              <details className="sf-disclosure"><summary>Cancel appointment</summary><div><p className="sf-meta">Cancelling before the start returns the credit to this package.</p><TrainingForm operation="transition" zone={zone} label="Cancel appointment" variant="danger"><input type="hidden" name="appointmentId" value={row.id} /><input type="hidden" name="status" value="cancelled" /><Field name="reason" label="Reason" /></TrainingForm></div></details>
            </> : null}
          </div> : null}
        </article>;
      })}</div> : null}
    </section>

    <section id="packages" className="sf-stack" aria-labelledby="packages-heading">
      <h2 id="packages-heading" className="sf-h3">Packages</h2>
      <p className="sf-meta">Packages are sold by the club and appear here once recorded.</p>
      <div className="sf-split">
        <div className="sf-stack">
          {!packages.length ? <EmptyState icon={<Dumbbell aria-hidden="true" />} title="No packages" action={<ArrowLink href={TRAINING_CONTACT}>Ask about personal training</ArrowLink>} /> : null}
          {packages.map(pack => {
            const selectable = currentPackages.some(item => item.id === pack.id);
            const status = trainingPackageDisplayStatus(pack, now);
            return <article className="sf-card" key={pack.id}>
              <div className="sf-titleline"><h3 className="sf-h3">{pack.serviceName}</h3><span className="sf-state" data-tone={packageTone(status)}>{humanizeLabel(status)}</span></div>
              <dl className="sf-facts" data-plain>
                <div><dt>Credits</dt><dd className="sf-num">{pack.creditsRemaining} of {pack.totalCredits} left</dd></div>
                <div><dt>Location</dt><dd>{name(data.locations, pack.locationId)}</dd></div>
                <div><dt>Session length</dt><dd>{pack.durationMinutes} min</dd></div>
                <div><dt>Expires</dt><dd>{date(pack.expiresAt)}</dd></div>
              </dl>
              {selectable ? <details className="sf-disclosure"><summary>Book with this package</summary><div><TrainingForm operation="book" scope={pack.id} retry={retry} zone={zone} label="Reserve"><input type="hidden" name="trainingPackageId" value={pack.id} /><Choice name="instructorId" label="Coach" rows={data.instructors} /><Choice name="resourceId" label="Room or equipment (optional)" rows={data.resources.filter((resource: any) => !resource.locationId || resource.locationId === pack.locationId)} optional /><Field name="startTime" label={`Start (${zone})`} type="datetime-local" /><Field name="memberNotes" label="Notes for your coach (optional)" required={false} /><p className="sf-hint">Availability is checked when you submit. One credit is held on confirmation.</p></TrainingForm></div></details> : null}
            </article>;
          })}
        </div>

        <aside className="sf-panel" aria-labelledby="coach-hours-heading">
          <h3 id="coach-hours-heading" className="sf-h3">Coaching hours</h3>
          {recurring.length || dated.length ? <>
            {recurring.length > 0 ? <div className="sf-hours-week">{WEEK.map(weekday => {
              const rows = recurring.filter(row => Number(row.dayOfWeek) === weekday.index);
              return <div key={weekday.index}>
                <span title={weekday.long}>{weekday.short}</span>
                {rows.length ? <ul>{rows.map(row => <li key={row.id} data-off={!row.isAvailable || undefined}><strong>{wallClock(row.startTime)}–{wallClock(row.endTime)}</strong><span>{name(data.instructors, row.instructorId)} · {name(data.locations, row.locationId)}{row.isAvailable ? "" : " · Unavailable"}</span></li>)}</ul> : <span>None</span>}
              </div>;
            })}</div> : null}
            {dated.length > 0 ? <div className="sf-stack" data-gap="sm"><p className="sf-label">Date changes</p><ul className="sf-hours-week">{dated.map(row => <li key={row.id} data-off={!row.isAvailable || undefined}><strong>{calendarDate(row.date)}</strong><span>{wallClock(row.startTime)}–{wallClock(row.endTime)} · {name(data.instructors, row.instructorId)} · {name(data.locations, row.locationId)}{row.isAvailable ? "" : " · Unavailable"}</span></li>)}</ul></div> : null}
          </> : <p className="sf-text-2">Not published</p>}
        </aside>
      </div>
    </section>

    <section className="sf-stack" aria-labelledby="coaching-heading">
      <h2 id="coaching-heading" className="sf-h3">From your coach</h2>
      {!assignments.length ? <EmptyState icon={<ClipboardList aria-hidden="true" />} title="Nothing assigned" /> : null}
      {assignments.map(row => <article className="sf-card" key={row.id}>
        <div className="sf-titleline"><h3 className="sf-h3">{row.title}</h3><span className="sf-state" data-tone={assignmentTone(row.status)}>{humanizeLabel(row.status)}</span></div>
        <p className="sf-meta">Due {date(row.dueAt)}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{row.instructions}</p>
        {row.memberEvidence ? <Banner title="Your progress"><span style={{ whiteSpace: "pre-wrap" }}>{row.memberEvidence}</span></Banner> : null}
        {row.review ? <Banner tone="ok" title="Coach feedback"><span style={{ whiteSpace: "pre-wrap" }}>{row.review}</span></Banner> : null}
        {row.status === "assigned" ? <TrainingForm operation="progress" zone={zone} label="Send progress"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="submitted" /><label className="sf-field">What you completed<textarea name="text" rows={4} maxLength={2000} required /></label></TrainingForm> : null}
      </article>)}
    </section>

    {skip > 0 || data.hasMore ? (
      <nav className="sf-actions" aria-label="Training record pages">
        {skip > 0 ? <Link className="sf-btn" data-variant="secondary" href={`?skip=${Math.max(0,skip - 50)}`}>Previous</Link> : null}
        {data.hasMore ? <Link className="sf-btn" data-variant="secondary" href={`?skip=${skip + 50}`}>More</Link> : null}
      </nav>
    ) : null}
  </>;
}
