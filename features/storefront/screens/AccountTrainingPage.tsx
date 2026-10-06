import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "../lib/data/user";
import { loadTrainingWorkspace, trainingAction } from "@/features/platform/training/actions/training";
import SubmitButton from "../modules/common/submit-button";
import { isTrainingPackageSelectable, trainingPackageDisplayStatus } from "@/features/platform/training/lib/package-availability";

function Field({ name, label, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label>{label}<input name={name} type={type} required={required} maxLength={type === "text" ? 2000 : undefined} /></label>;
}
function Choice({ name, label, rows, optional = false }: { name: string; label: string; rows: Array<{ id: string; name: string }>; optional?: boolean }) {
  return <label>{label}<select name={name} required={!optional}><option value="">{optional ? "Keep current / no preference" : "Select an option"}</option>{rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>;
}
function TrainingForm({ operation, zone, label, children }: { operation: string; zone: string; label: string; children: React.ReactNode }) {
  return <form action={trainingAction} className="sf-member-form"><input type="hidden" name="operation" value={operation} /><input type="hidden" name="surface" value="member" /><input type="hidden" name="timeZone" value={zone} /><input type="hidden" name="requestKey" value={randomUUID()} />{children}<SubmitButton pendingLabel="Saving your request…">{label}</SubmitButton></form>;
}
export default async function AccountTrainingPage({ searchParams }: { searchParams: Promise<{ skip?: string; error?: string; success?: string }> }) {
  if (!await getUser()) redirect("/account?returnTo=%2Faccount%2Ftraining");
  const params = await searchParams;
  const parsedSkip = Number(params.skip || 0);
  const skip = Number.isFinite(parsedSkip) ? Math.max(0, Math.trunc(parsedSkip)) : 0;
  const data = await loadTrainingWorkspace(skip);
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
  const name = (rows: any[], id: string) => rows.find(row => row.id === id)?.name || "Not published";
  const currentPackages = packages.filter(pack => isTrainingPackageSelectable(pack, now));
  return <div className="space-y-8"><header><p className="sf-eyebrow">Coaching that continues between visits</p><h1 className="sf-display mt-3 text-[var(--text-display-s)]">Your personal training</h1><p className="sf-muted mt-4">Appointments, package credits and feedback from your coach. All times in {zone}.</p></header>
    {params.error && <p role="alert" className="sf-status-error p-4">{params.error}</p>}{params.success && <p role="status" className="sf-status-success p-4">Your training request was saved. Review the updated details below.</p>}
    <nav className="sf-segmented" aria-label="Training sections"><a href="#appointments">Appointments</a><a href="#packages">Packages</a><a href="#coaching">Coaching work</a></nav>
    <section id="appointments"><div className="sf-section-heading"><h2>Your appointments</h2><a className="sf-link" href="#packages">Book using a package →</a></div>{!appointments.length && <div className="sf-empty"><h3>No appointments on this page</h3><p>Use an active package below, or contact the club to arrange personal training.</p><Link href="/contact" className="sf-btn-secondary">Ask about training</Link></div>}
      <div className="space-y-4">{appointments.map(row => <article className="sf-panel" key={row.id}><div className="sf-section-heading"><h3 className="text-xl font-semibold">{row.serviceName}</h3><span className="sf-badge">{row.status.replaceAll("_", " ")}</span></div><p>{date(row.startTime)}</p><p className="sf-muted">{name(data.instructors, row.instructorId)} · {name(data.locations, row.locationId)}</p>{row.cancellationReason && <p className="sf-notice mt-4">{row.cancellationReason}</p>}
      {["scheduled", "confirmed"].includes(row.status) && Date.parse(row.startTime) > new Date().getTime() && <><details className="mt-4"><summary>Change this appointment</summary><TrainingForm operation="reschedule" zone={zone} label="Request new appointment time"><input type="hidden" name="appointmentId" value={row.id} /><Choice name="instructorId" label="Coach" rows={data.instructors} optional /><Field name="startTime" label={`New start time (${zone})`} type="datetime-local" /><Field name="reason" label="Reason for changing" /><p className="sf-muted">Your current booking stays reserved if the new time cannot be booked.</p></TrainingForm></details><details><summary>Cancel this appointment</summary><p className="sf-muted">Cancellation before the start returns the credit to this package and its original expiry.</p><TrainingForm operation="transition" zone={zone} label="Confirm appointment cancellation"><input type="hidden" name="appointmentId" value={row.id} /><input type="hidden" name="status" value="cancelled" /><Field name="reason" label="Reason for cancelling" /></TrainingForm></details></>}
      </article>)}</div>
    </section>
    <section id="packages"><div className="sf-section-heading"><h2>Your package credits</h2></div><p className="sf-notice mb-5">Training packages are purchased through the club and appear here after staff record payment. Online package checkout is not available.</p>{!packages.length && <p className="sf-muted">No recorded packages on this page. Contact the club if you have purchased a package that is missing.</p>}
      <div className="space-y-4">{packages.map(pack => <article className="sf-panel" key={pack.id}><div className="sf-section-heading"><h3 className="text-xl font-semibold">{pack.serviceName}</h3><span className="sf-badge">{trainingPackageDisplayStatus(pack, now)}</span></div><p><strong>{pack.creditsRemaining} of {pack.totalCredits} credits left</strong> · {pack.durationMinutes} minutes per appointment</p><p className="sf-muted">{name(data.locations, pack.locationId)} · Expires {date(pack.expiresAt)}</p>{currentPackages.some(item => item.id === pack.id) && <details className="mt-4"><summary>Book with this package</summary><p className="sf-muted">Choose from the published coaching hours below. Availability and conflicts are checked when you submit. One package credit is reserved on confirmation.</p><TrainingForm operation="book" zone={zone} label="Reserve personal training"><input type="hidden" name="memberId" value={data.memberId} /><input type="hidden" name="trainingPackageId" value={pack.id} /><input type="hidden" name="locationId" value={pack.locationId} /><Choice name="instructorId" label="Coach" rows={data.instructors} /><Choice name="resourceId" label="Room or resource (optional)" rows={data.resources.filter((resource: any) => !resource.locationId || resource.locationId === pack.locationId)} optional /><Field name="startTime" label={`Start time (${zone})`} type="datetime-local" /><Field name="memberNotes" label="Anything your coach should know? (optional)" required={false} /></TrainingForm></details>}</article>)}</div>
      <details className="mt-5"><summary>Published coaching hours</summary><p className="sf-muted mb-4">These are working hours, not a list of available appointment slots. Time off and other reservations can affect booking.</p>{data.availability.length ? <ul className="space-y-3">{data.availability.map((row: any) => <li key={row.id}>{name(data.instructors, row.instructorId)} · {name(data.locations, row.locationId)}<br /><span className="sf-muted">{row.type === "recurring" ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][row.dayOfWeek] : date(row.date)} · {row.startTime}–{row.endTime} · {row.isAvailable ? "Working hours" : "Unavailable"}</span></li>)}</ul> : <p className="sf-muted">No coaching hours published. Ask the club to arrange a time.</p>}</details>
    </section>
    <section id="coaching"><div className="sf-section-heading"><h2>Work from your coach</h2></div>{!assignments.length && <div className="sf-empty"><h3>You’re up to date</h3><p>Coaching assignments and feedback will appear here when your coach publishes them.</p></div>}<div className="space-y-4">{assignments.map(row => <article className="sf-panel" key={row.id}><div className="sf-section-heading"><h3 className="text-xl font-semibold">{row.title}</h3><span className="sf-badge">{row.status}</span></div><p className="sf-muted mb-4">Due {date(row.dueAt)}</p><p className="whitespace-pre-wrap">{row.instructions}</p>{row.memberEvidence && <div className="sf-notice mt-4"><strong>Your progress</strong><p className="whitespace-pre-wrap">{row.memberEvidence}</p></div>}{row.review && <div className="sf-notice mt-4"><strong>Coach feedback</strong><p className="whitespace-pre-wrap">{row.review}</p></div>}{row.status === "assigned" && <TrainingForm operation="progress" zone={zone} label="Send progress to coach"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="submitted" /><label>What did you complete?<textarea name="text" rows={4} maxLength={2000} required placeholder="Activities, duration and observations" /></label></TrainingForm>}</article>)}</div></section>
    <nav className="sf-actions" aria-label="Training record pages">{skip > 0 && <Link className="sf-btn-secondary" href={`?skip=${Math.max(0,skip - 50)}`}>Previous records</Link>}{[data.packages, data.appointments, data.assignments].some(rows => rows.length === 50) && <Link className="sf-btn-secondary" href={`?skip=${skip + 50}`}>More records</Link>}</nav><p className="sf-muted text-sm">Up to 50 records per section are loaded on each page. Contact the club for a complete training history.</p>
  </div>;
}
