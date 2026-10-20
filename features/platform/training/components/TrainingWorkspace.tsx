import { randomUUID } from "node:crypto";
import { CalendarClock, CalendarRange, ClipboardCheck, Dumbbell, Package, UserPlus } from "lucide-react";
import { trainingAction } from "../actions/training";
import { CardPaymentsPanel } from "@/features/platform/components/CardPaymentsPanel";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  Disclosure,
  EmptyBlock,
  FieldInput,
  FieldTextarea,
  FormField,
  NativeSelect,
  Notice,
  PaginationBar,
  Panel,
  PanelBody,
  PanelHeader,
  PlatformBody,
  SectionNav,
  StatusPill,
  Td,
  Th,
  Tr,
  humanize,
  type Tone,
} from "@/features/platform/components/platform-ui";
import { isTrainingPackageSelectable, trainingPackageDisplayStatus } from "../lib/package-availability";
import { retryIntentFor, retryKeyFor, retryValue, type RetryDraft } from "@/features/platform/lib/retry-draft";
import { DiscardRetainedRequest, RetainedRequestNotice } from "@/features/platform/components/RetainedRequest";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Field({ name, label, type = "text", value, required = true, hint }: { name: string; label: string; type?: string; value?: string | number; required?: boolean; hint?: string }) {
  return (
    <FormField label={label} optional={!required} hint={hint}>
      <FieldInput name={name} type={type} defaultValue={value} required={required} />
    </FormField>
  );
}
function Choice({ name, label, options, optional = false, value }: { name: string; label: string; options: any[]; optional?: boolean; value?: string }) {
  return (
    <FormField label={label} optional={optional}>
      <NativeSelect name={name} required={!optional} defaultValue={value}>
        <option value="">{optional ? "None" : "Select…"}</option>
        {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </NativeSelect>
    </FormField>
  );
}
function Form({ operation, scope = "", children, member, timeZone, retry, submitLabel = "Save", note, destructive = false, extraAction }: { operation: string; scope?: string; children: React.ReactNode; member: boolean; timeZone: string; retry?: RetryDraft; submitLabel?: string; note?: React.ReactNode; destructive?: boolean; extraAction?: React.ReactNode }) {
  // While an earlier request on the same record is unconfirmed, the form is locked to it: Retry
  // resends that recorded request (same key and values); only an explicit discard frees it.
  const intentId = retryIntentFor(retry, operation, scope);
  if (intentId && retry) {
    return (
      <div className="grid gap-3">
        <form action={trainingAction} className="grid gap-3">
          <input type="hidden" name="intentId" value={intentId}/>
          <input type="hidden" name="surface" value={member ? "member" : "operator"}/>
          <RetainedRequestNotice retry={retry}/>
          <div className="flex justify-end"><Button type="submit" variant={destructive ? "destructive" : "default"}>Retry: {submitLabel}</Button></div>
        </form>
        <DiscardRetainedRequest intentId={intentId} returnTo={member ? "/account/training" : "/dashboard/platform/training"}/>
      </div>
    );
  }
  const requestKey = retryKeyFor(retry, operation, scope, randomUUID);
  return (
    <form action={trainingAction} className="grid gap-4">
      <input type="hidden" name="operation" value={operation}/>
      <input type="hidden" name="surface" value={member ? "member" : "operator"}/>
      <input type="hidden" name="timeZone" value={timeZone}/>
      <input type="hidden" name="requestKey" value={requestKey}/>
      {scope ? <input type="hidden" name="retryScope" value={scope}/> : null}
      {children}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {note ? <p className="text-pretty text-xs leading-5 text-muted-foreground">{note}</p> : <span />}
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          {extraAction}
          <Button type="submit" variant={destructive ? "destructive" : "default"} className="shrink-0">{submitLabel}</Button>
        </div>
      </div>
    </form>
  );
}
function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={cols === 3 ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>{children}</div>;
}

function appointmentTone(status: string): Tone {
  if (status === "completed") return "positive";
  if (status === "checked_in") return "info";
  if (status === "no_show") return "danger";
  if (status === "cancelled") return "neutral";
  return "warning";
}

function packageTone(status: string): Tone {
  if (status === "active") return "positive";
  if (status === "expired") return "warning";
  if (status === "refunded" || status === "cancelled") return "neutral";
  return "neutral";
}

function coachingTone(status: string): Tone {
  if (status === "reviewed") return "positive";
  if (status === "submitted") return "info";
  return "warning";
}

function leadTone(status: string): Tone {
  if (status === "converted") return "positive";
  if (status === "closed") return "neutral";
  if (status === "trial_booked" || status === "trial_attended") return "info";
  return "warning";
}

export function TrainingWorkspace({ data, member = false, error, success, retry, pendingIntents = [], returnedCheckout, closedCheckout }: { data: any; member?: boolean; error?: string; success?: string; retry?: RetryDraft; pendingIntents?: Array<{ id: string; operation: string; createdAt: string }>; returnedCheckout?: string; closedCheckout?: boolean }) {
  const formProps = { member, timeZone: data.timeZone, retry };
  const kept = (operation: string, field: string, scope = "") => retryValue(retry, operation, field, scope);
  const now = Number.isSafeInteger(data.asOf) ? data.asOf : Number.NaN;
  const selectablePackages = data.packages.filter((pack: any) => isTrainingPackageSelectable(pack, now));
  const name = (rows: any[], id: string) => rows.find(row => row.id === id)?.name || id;
  const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.timeZone }).format(new Date(value));
  const dayOf = (value: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: data.timeZone }).format(new Date(value));
  const localDay = (value?: string | null) => value ? new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: data.timeZone }).format(new Date(value)) : "";
  const timeOf = (value: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: data.timeZone }).format(new Date(value));
  const leads: any[] = data.leads || [];
  const canReserve = Boolean(data.memberId || data.canManageAppointments);
  const canAssignCoaching = Boolean(data.canManagePrograms || (data.isInstructor && data.ownInstructorId));
  // A package fixes its owner, service and site, so reserving picks the package and derives both.
  const packageLabel = (pack: any) => [pack.memberName, pack.serviceName, `${pack.creditsRemaining} of ${pack.totalCredits} left`, name(data.locations, pack.locationId), pack.expiresAt ? `expires ${dayOf(pack.expiresAt)}` : null].filter(Boolean).join(" · ");

  const sections = [
    { id: "appointments", label: "Appointments", count: data.appointments.length },
    ...(canReserve ? [{ id: "reserve", label: "Reserve" }] : []),
    { id: "packages", label: "Packages", count: data.packages.length },
    { id: "coaching", label: "Coaching", count: data.assignments.length },
    { id: "availability", label: "Availability", count: data.availability.length },
    ...(data.canManagePeople ? [{ id: "leads", label: "Inquiries & trials", count: leads.length }] : []),
  ];

  return <PlatformBody>
    {error ? <Notice tone="danger" title={retry ? "Not confirmed" : "Not saved"}>{error}</Notice> : null}
    {pendingIntents.filter(row => row.id !== retry?.intentId).length ? (
      <Notice tone="warning" title="Unconfirmed requests">
        These requests were sent but never confirmed.{" "}
        {pendingIntents.filter(row => row.id !== retry?.intentId).map((row, index) => <span key={row.id}>{index ? " · " : ""}<a className="underline" href={`?intent=${encodeURIComponent(row.id)}`}>{humanize(row.operation)} from {date(row.createdAt)}</a></span>)}
      </Notice>
    ) : null}
    {success ? <Notice tone="positive">{success}</Notice> : null}
    {member ? <Notice tone="info">Training packages are sold at the front desk. Your purchased credits and appointments appear here.</Notice> : null}
    {!member && data.canManageAppointments ? <CardPaymentsPanel rows={data.cardPayments || []} surface="training" timeZone={data.timeZone} returnedCheckout={returnedCheckout} closedCheckout={closedCheckout}
      olderHref={data.cardPaymentsHasMore ? `?cardSkip=${data.cardSkip + 50}#card-payments` : null}
      newerHref={data.cardSkip > 0 ? `?cardSkip=${Math.max(0, data.cardSkip - 50)}#card-payments` : null} /> : null}
    {!member && (data.optionsTruncated?.instructors || data.optionsTruncated?.locations || data.optionsTruncated?.resources) ? (
      <Notice tone="info">Choice lists show the first 500 {[data.optionsTruncated.instructors && "coaches", data.optionsTruncated.locations && "locations", data.optionsTruncated.resources && "rooms"].filter(Boolean).join(", ")} by name.</Notice>
    ) : null}

    <SectionNav items={sections} />

    <Panel id="appointments">
      <PanelHeader icon={CalendarClock} title="Appointments" count={data.appointments.length} description="Cancel before the appointment starts to return its credit to the same package and expiry." />
      {data.appointments.length === 0 ? (
        <EmptyBlock compact icon={CalendarClock} title="No appointments on this page" description={canReserve ? "Reserve personal training below to create one." : undefined} />
      ) : (
        <ul className="divide-y">
          {data.appointments.map((row: any) => {
            const canReschedule = ["scheduled", "confirmed"].includes(row.status) && (data.canManageAppointments || row.memberId === data.memberId);
            const transitions: string[] = row.allowedTransitions || [];
            const canTransition = transitions.length > 0;
            return <li key={row.id} className="space-y-3 px-4 py-4 sm:px-5">
              <div className="flex items-start gap-4">
                <div className="w-20 shrink-0 tabular-nums">
                  <p className={row.status === "cancelled" ? "text-sm font-semibold text-muted-foreground line-through" : "text-sm font-semibold"}>{timeOf(row.startTime)}</p>
                  <p className="text-[11px] text-muted-foreground">{dayOf(row.startTime)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{row.serviceName}</p>
                    <StatusPill tone={appointmentTone(row.status)}>{humanize(row.status)}</StatusPill>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.memberName && !member ? `${row.memberName} · ` : ""}with {name(data.instructors, row.instructorId)}</p>
                  {row.cancellationReason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {row.cancellationReason}</p> : null}
                </div>
              </div>
              {canReschedule || canTransition ? (
                <div className="grid gap-2 sm:pl-24 lg:grid-cols-2">
                  {canReschedule ? <Disclosure summary="Reschedule or change instructor…">
                    <Form operation="reschedule" scope={row.id} {...formProps} submitLabel="Reschedule" note="The old reservation is retained if the replacement cannot be booked.">
                      <input type="hidden" name="appointmentId" value={row.id}/>
                      <Choice name="instructorId" label="Replacement instructor" options={data.instructors} optional/>
                      <Field name="startTime" label={`New start (${data.timeZone})`} type="datetime-local"/>
                      <Field name="reason" label="Reason"/>
                    </Form>
                  </Disclosure> : null}
                  {canTransition ? <Disclosure summary="Update status…">
                    <Form operation="transition" {...formProps} submitLabel="Update status">
                      <input type="hidden" name="appointmentId" value={row.id}/>
                      <Choice name="status" label="Next state" options={transitions.map(id => ({ id, name: humanize(id) }))}/>
                      <Field name="reason" label="Reason (required to cancel)" required={false}/>
                    </Form>
                  </Disclosure> : null}
                </div>
              ) : null}
            </li>;
          })}
        </ul>
      )}
    </Panel>

    {canReserve ? <Panel id="reserve">
      <PanelHeader icon={Dumbbell} title="Reserve personal training" description="One credit is reserved immediately. The package fixes service, duration, price and location. Availability and conflicts are checked when you save." />
      <PanelBody>
        {selectablePackages.length === 0 ? <Notice tone="warning" className="mb-4">No package currently has bookable credits. Record a purchased package first.</Notice> : null}
        <Form operation="book" {...formProps} submitLabel="Reserve session">
          <Grid cols={3}>
            <Choice name="trainingPackageId" label={data.canManageAppointments ? "Member package" : "Package"} options={selectablePackages.map((p: any) => ({ id: p.id, name: packageLabel(p) }))} value={kept("book", "trainingPackageId")}/>
            <Choice name="instructorId" label="Instructor" options={data.instructors} value={kept("book", "instructorId")}/>
            <Choice name="resourceId" label="Room or resource" options={data.resources} optional value={kept("book", "resourceId")}/>
            <Field name="startTime" label={`Start (${data.timeZone})`} type="datetime-local" value={kept("book", "startTime")}/>
          </Grid>
          <Field name="memberNotes" label="Notes" required={false}/>
        </Form>
      </PanelBody>
    </Panel> : null}

    <Panel id="packages">
      <PanelHeader icon={Package} title="Training packages" count={data.packages.length} description="Prepaid credits per member. Expired credits cannot book later sessions." />
      {data.packages.length === 0 ? (
        <EmptyBlock compact icon={Package} title="No recorded packages" description={member ? "Ask at the front desk to buy a package." : data.canManageAppointments ? "Record a purchased package below." : undefined} />
      ) : (
        <ul className="divide-y">
          {data.packages.map((pack: any) => {
            const status = trainingPackageDisplayStatus(pack, now);
            return <li key={pack.id} className="space-y-3 px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{pack.serviceName}</p>
                    <StatusPill tone={packageTone(status)}>{humanize(status)}</StatusPill>
                  </div>
                  {pack.memberName && !member ? <p className="mt-0.5 text-xs font-medium">{pack.memberName}</p> : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">{pack.durationMinutes} min sessions · {name(data.locations, pack.locationId)} · expires {date(pack.expiresAt)}</p>
                </div>
                <div className="flex items-baseline justify-between text-xs sm:justify-end sm:gap-2">
                  <span className="text-muted-foreground">Credits left</span>
                  <span className={pack.creditsRemaining > 0 ? "font-medium tabular-nums" : "font-medium tabular-nums text-amber-700 dark:text-amber-400"}>{pack.creditsRemaining}<span className="text-muted-foreground">/{pack.totalCredits}</span></span>
                </div>
              </div>
              {data.canManageAppointments && pack.status === "active" && pack.terms?.tender === "card" ? <Disclosure summary="Refund unused credits to the card…" tone="danger">
                <Form operation="refund" scope={pack.id} {...formProps} submitLabel={`Refund ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.floor(pack.amount * pack.creditsRemaining / pack.totalCredits) / 100)}`} destructive note="Complete or cancel every reserved appointment first. This refunds the unused credits to the original card through Stripe and retires them.">
                  <input type="hidden" name="packageId" value={pack.id}/>
                </Form>
              </Disclosure> : data.canManageAppointments && pack.status === "active" ? <Disclosure summary="Record an externally settled unused-credit refund…" tone="danger">
                <Form operation="refund" scope={pack.id} {...formProps} submitLabel="Record refund" destructive note="Complete or cancel every reserved appointment first. This action records evidence and retires the unused credits; it does not send money.">
                  <input type="hidden" name="packageId" value={pack.id}/>
                  <Grid>
                    <Field name="amount" type="number" label="Settled refund in cents (unused units only)" value={kept("refund", "amount", pack.id) ?? Math.floor(pack.amount * pack.creditsRemaining / pack.totalCredits)}/>
                    <Field name="refundReference" label="External settled refund reference" value={kept("refund", "refundReference", pack.id)}/>
                  </Grid>
                </Form>
              </Disclosure> : null}
            </li>;
          })}
        </ul>
      )}
      {data.canManageAppointments ? <div className="border-t bg-muted/20 px-4 py-3 sm:px-5">
        <Disclosure summary="Record a purchased package…">
          <Form
            operation="package"
            {...formProps}
            submitLabel="Record externally paid package"
            note="Take card payment opens Stripe checkout for the total; credits are issued only after the payment completes. For a package paid outside Gym, enter its settled payment reference and date. Never record an unpaid promise."
            extraAction={<Button type="submit" variant="outline" name="cardCheckout" value="yes" formNoValidate>Take card payment</Button>}
          >
            <Grid cols={3}>
              <Choice name="memberId" label="Member" options={data.members} value={kept("package", "memberId")}/>
              <Choice name="locationId" label="Location" options={data.locations} value={kept("package", "locationId")}/>
              <Field name="serviceName" label="Purchased service" value={kept("package", "serviceName")}/>
              <Field name="totalCredits" type="number" label="Purchased credits" value={kept("package", "totalCredits")}/>
              <Field name="durationMinutes" type="number" label="Minutes per appointment" value={kept("package", "durationMinutes") ?? 60}/>
              <Field name="amount" type="number" label="Package total in USD cents" value={kept("package", "amount")}/>
              <Field name="purchaseReference" label="External settled payment reference" hint="Not needed for card payment" value={kept("package", "purchaseReference")}/>
              <Field name="purchasedAt" type="datetime-local" label="Payment date" hint="Not needed for card payment" value={kept("package", "purchasedAt")}/>
              <Field name="expiresAt" type="datetime-local" label="Agreed package expiry" value={kept("package", "expiresAt")}/>
            </Grid>
          </Form>
        </Disclosure>
      </div> : null}
    </Panel>

    <Panel id="coaching">
      <PanelHeader icon={ClipboardCheck} title="Coaching work" count={data.assignments.length} description="Assigned programming, member progress, and coach review." />
      {data.assignments.length === 0 ? (
        <EmptyBlock compact icon={ClipboardCheck} title="No assigned coaching work" />
      ) : (
        <ul className="divide-y">
          {data.assignments.map((row: any) => <li key={row.id} className="space-y-3 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{row.title}</p>
                  <StatusPill tone={coachingTone(row.status)}>{humanize(row.status)}</StatusPill>
                </div>
                {!member ? <p className="mt-0.5 text-xs text-muted-foreground">For <span className="font-medium text-foreground">{row.memberName}</span> <span className="font-mono">#{row.memberRef}</span> · coach {row.coachName}</p> : null}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">Due {date(row.dueAt)}</p>
            </div>
            <p className="whitespace-pre-wrap text-pretty text-sm">{row.instructions}</p>
            {row.memberEvidence ? <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"><p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Member progress</p><p className="whitespace-pre-wrap">{row.memberEvidence}</p></div> : null}
            {row.review ? <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"><p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Coach review</p><p className="whitespace-pre-wrap">{row.review}</p></div> : null}
            {row.status === "assigned" && row.memberId === data.memberId && <Disclosure summary="Submit progress…">
              <Form operation="progress" scope={row.id} {...formProps} submitLabel="Submit progress">
                <input type="hidden" name="id" value={row.id}/><input type="hidden" name="status" value="submitted"/>
                <Field name="text" label="What you completed, duration and observations"/>
              </Form>
            </Disclosure>}
            {data.canManagePrograms || (data.isInstructor && row.instructorId === data.ownInstructorId) ? row.status === "submitted" && <Disclosure summary={`Review ${row.memberName}’s submission…`}>
              <Form operation="progress" scope={row.id} {...formProps} submitLabel="Save review">
                <input type="hidden" name="id" value={row.id}/><input type="hidden" name="status" value="reviewed"/>
                <Field name="text" label="Review and next steps"/>
              </Form>
            </Disclosure> : null}
          </li>)}
        </ul>
      )}
      {!member && (data.membersHasMore || data.memberQuery) ? (
        <form className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-xs sm:px-5" method="get">
          <span className="text-muted-foreground">{data.membersHasMore ? "Member choices show the first 200 matches." : `Member choices match “${data.memberQuery}”.`}</span>
          <FieldInput name="memberQuery" defaultValue={data.memberQuery} placeholder="Find a member by name or email" aria-label="Find a member" className="h-8 w-56"/>
          <Button type="submit" size="sm" variant="outline">Find</Button>
        </form>
      ) : null}
      {canAssignCoaching && !member ? <div className="border-t bg-muted/20 px-4 py-3 sm:px-5">
        <Disclosure summary="Assign coaching work…">
          <Form operation="coaching" {...formProps} submitLabel="Assign">
            <Grid cols={3}>
              <Choice name="memberId" label="Member" options={data.members}/>
              {data.canManagePrograms ? <Choice name="instructorId" label="Coach" options={data.instructors}/> : <input type="hidden" name="instructorId" value={data.ownInstructorId}/>}
              <Field name="dueAt" type="datetime-local" label="Due"/>
            </Grid>
            <Field name="title" label="Goal / session title"/>
            <FormField label="Instructions"><FieldTextarea name="instructions" rows={4} required className="min-h-24"/></FormField>
          </Form>
        </Disclosure>
      </div> : null}
    </Panel>

    <Panel id="availability">
      <PanelHeader icon={CalendarRange} title="Published availability" count={data.availability.length} description="Recurring hours, one-time sessions, and time off by instructor." />
      {data.availability.length === 0 ? (
        <EmptyBlock compact icon={CalendarRange} title="No availability published" />
      ) : (
        <DataTable label="Published availability" minWidth="36rem">
          <thead>
            <tr><Th>Instructor</Th><Th>Location</Th><Th>When</Th><Th>Hours</Th><Th>State</Th>{data.canManageAppointments ? <Th><span className="sr-only">Actions</span></Th> : null}</tr>
          </thead>
          <tbody>
            {data.availability.map((row: any) => <Tr key={row.id}>
              <Td className="font-medium">{name(data.instructors, row.instructorId)}</Td>
              <Td className="text-muted-foreground">{name(data.locations, row.locationId)}</Td>
              <Td>{row.type === "recurring" ? `Every ${WEEKDAYS[row.dayOfWeek]}` : row.date ? dayOf(row.date) : "Undated"}</Td>
              <Td className="tabular-nums">{row.startTime}–{row.endTime}</Td>
              <Td><StatusPill tone={row.isAvailable ? "positive" : "neutral"}>{row.isAvailable ? "Available" : "Unavailable"}</StatusPill>{row.effectiveFrom || row.effectiveTo ? <span className="mt-1 block text-[11px] text-muted-foreground">{row.effectiveFrom ? `from ${dayOf(row.effectiveFrom)}` : ""} {row.effectiveTo ? `until ${dayOf(row.effectiveTo)}` : ""}</span> : null}</Td>
              {data.canManageAppointments ? <Td>
                <Disclosure summary="Edit">
                  <Form operation="availability" scope={row.id} {...formProps} submitLabel="Save changes" note="Owner and location stay the same; changes that conflict with booked appointments are rejected.">
                    <input type="hidden" name="id" value={row.id}/>
                    <input type="hidden" name="instructorId" value={row.instructorId}/>
                    <input type="hidden" name="locationId" value={row.locationId}/>
                    <input type="hidden" name="type" value={row.type}/>
                    <Grid>
                      {row.type === "recurring" ? <FormField label="Weekday"><NativeSelect name="dayOfWeek" defaultValue={String(row.dayOfWeek ?? "")} required>{WEEKDAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}</NativeSelect></FormField> : <Field name="date" type="date" label="Date" value={localDay(row.date)}/>}
                      <Field name="fromTime" type="time" label="From" value={row.startTime}/>
                      <Field name="toTime" type="time" label="To" value={row.endTime}/>
                      {row.type === "recurring" ? <Field name="effectiveFrom" type="date" label="Effective from" value={localDay(row.effectiveFrom)} required={false}/> : null}
                      {row.type === "recurring" ? <Field name="effectiveTo" type="date" label="Effective until" value={localDay(row.effectiveTo)} required={false}/> : null}
                      <Field name="reason" label="Reason" value={row.reason || ""} required={false}/>
                    </Grid>
                  </Form>
                </Disclosure>
              </Td> : null}
            </Tr>)}
          </tbody>
        </DataTable>
      )}
      {data.availabilitySkip > 0 || data.availabilityHasMore ? (
        <div className="flex justify-between border-t px-4 py-2 text-xs sm:px-5">
          {data.availabilitySkip > 0 ? <a className="underline" href={`?availabilitySkip=${Math.max(0, data.availabilitySkip - 200)}#availability`}>Previous availability</a> : <span/>}
          {data.availabilityHasMore ? <a className="underline" href={`?availabilitySkip=${data.availabilitySkip + 200}#availability`}>More availability</a> : <span/>}
        </div>
      ) : null}
      {data.canManageAppointments ? <div className="border-t bg-muted/20 px-4 py-3 sm:px-5">
        <Disclosure summary="Publish availability or time off…">
          <Form operation="availability" {...formProps} submitLabel="Publish" note="Changes that invalidate already reserved appointments are rejected.">
            <Grid cols={3}>
              <Choice name="instructorId" label="Instructor" options={data.instructors}/>
              <Choice name="locationId" label="Location" options={data.locations}/>
              <Choice name="type" label="Type" options={["recurring", "one_time", "time_off"].map(id => ({id, name: humanize(id)}))}/>
              <Choice name="dayOfWeek" label="Weekday (recurring)" options={WEEKDAYS.map((name,id)=>({id:String(id), name}))} optional/>
              <Field name="date" type="date" label="Date (one time or time off)" required={false}/>
              <Field name="fromTime" type="time" label="From"/>
              <Field name="toTime" type="time" label="To"/>
              <Field name="effectiveFrom" type="date" label="Effective from (recurring)" required={false}/>
              <Field name="effectiveTo" type="date" label="Effective until (recurring)" required={false}/>
              <Field name="reason" label="Reason" required={false}/>
            </Grid>
          </Form>
        </Disclosure>
      </div> : null}
    </Panel>

    {data.canManagePeople ? <Panel id="leads">
      <PanelHeader icon={UserPlus} title="Inquiry and trial follow-up" count={leads.length} description="Trial times are follow-up appointments; class capacity still requires a separate class booking. Recording an inquiry does not grant marketing consent." />
      {leads.length === 0 ? (
        <EmptyBlock compact icon={UserPlus} title="No inquiries recorded" />
      ) : (
        <ul className="divide-y">
          {leads.map((lead: any) => <li key={lead.id} className="space-y-2 px-4 py-3.5 sm:px-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{lead.name}</p>
                  <StatusPill tone={leadTone(lead.status)}>{humanize(lead.status)}</StatusPill>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.email} · source {lead.source}</p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">Next action {lead.nextActionAt ? date(lead.nextActionAt) : "not scheduled"}</p>
            </div>
            {(lead.history || []).length ? <Disclosure summary={`History (${lead.history.length})`}>
              <ol className="space-y-1.5 text-xs">
                {lead.history.map((entry: any, index: number) => <li key={index}><span className="font-medium">{humanize(entry.to)}</span> <span className="text-muted-foreground">· {entry.at}</span>{entry.note ? <span className="block text-muted-foreground">{entry.note}</span> : null}</li>)}
              </ol>
            </Disclosure> : null}
          </li>)}
        </ul>
      )}
      <div className="border-t bg-muted/20 px-4 py-3 sm:px-5">
        <Disclosure summary="Record an inquiry or update its state…">
          <Form operation="lead" {...formProps} submitLabel="Save inquiry">
            <Grid cols={3}>
              <Field name="name" label="Name"/>
              <Field name="email" type="email" label="Email" hint="Matches the existing case when updating."/>
              <Field name="source" label="Inquiry source" value="operator"/>
              <Choice name="status" label="State" options={["new","contacted","trial_booked","trial_attended","converted","closed"].map(id=>({id,name:humanize(id)}))}/>
              <Field name="trialAt" type="datetime-local" label="Trial appointment" required={false}/>
              <Field name="nextActionAt" type="datetime-local" label="Next follow-up" required={false}/>
            </Grid>
            <Choice name="memberId" label="Matching registered member (conversion only)" options={data.members} optional/>
            <Field name="note" label="Follow-up / transition evidence"/>
          </Form>
        </Disclosure>
      </div>
    </Panel> : null}

    {data.skip > 0 || data.hasMore ? <PaginationBar
      summary={!data.appointments.length && !data.packages.length && !data.assignments.length && !leads.length ? "No history this far back" : `Showing history from record ${data.skip + 1}`}
      previousHref={data.skip > 0 ? `?skip=${!data.appointments.length && !data.packages.length && !data.assignments.length && !leads.length ? 0 : Math.max(0, data.skip - 50)}` : null}
      nextHref={data.hasMore ? `?skip=${data.skip + 50}` : null}
    /> : null}
  </PlatformBody>;
}
