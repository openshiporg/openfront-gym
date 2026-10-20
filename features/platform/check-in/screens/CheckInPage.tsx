import { DoorOpen, ExternalLink, ScanLine, SearchX, UserSearch } from "lucide-react";
import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Button } from "@/components/ui/button";
import {
  EmptyBlock,
  Initials,
  NativeSelect,
  Notice,
  PaginationBar,
  Panel,
  PanelHeader,
  PlatformBody,
  PlatformHeader,
  SearchField,
  SplitLayout,
  StatusPill,
  humanize,
} from "@/features/platform/components/platform-ui";
import { getFrontDeskData } from "../actions/check-in";
import { enumParam, firstParam, pageParam, type SearchParamValue } from "@/features/platform/lib/search-params";
import { CheckInForm, CheckOutForm } from "../components/FrontDeskForms";

function formatTime(value: string | null | undefined, timeZone: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function formatDay(value: string | null | undefined, timeZone: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(d);
}

export async function CheckInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const q = firstParam(resolved.q, 100);
  const visitQuery = firstParam(resolved.vq, 100);
  const visitLocationId = firstParam(resolved.vloc, 100);
  const visitOrder = enumParam(resolved.vorder, ["newest", "oldest"] as const, "newest");
  const visitSkip = pageParam(resolved.vskip, 1_000_000);
  const data = await getFrontDeskData(q, { visitQuery, visitLocationId, visitOrder, visitSkip });
  const searched = q.length >= 2;
  const visits = data.openVisits;
  const visitHref = (skip: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (visitQuery) params.set("vq", visitQuery);
    if (visitLocationId) params.set("vloc", visitLocationId);
    if (visitOrder !== "newest") params.set("vorder", visitOrder);
    if (skip) params.set("vskip", String(skip));
    const text = params.toString();
    return text ? `/dashboard/platform/check-in?${text}` : "/dashboard/platform/check-in";
  };

  const header = (
    <PlatformHeader
      eyebrow="Front desk"
      title="Check-in"
      description="Confirm identity and current membership eligibility. Access hours, participation policy and location are checked again when you record entry."
      actions={
        <Button asChild variant="outline" size="sm">
          <a href="/kiosk/check-in" target="_blank" rel="noreferrer">
            <ScanLine aria-hidden /> Open kiosk <ExternalLink className="size-3.5 opacity-60" aria-hidden />
          </a>
        </Button>
      }
    />
  );

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "page" as const, label: "Platform" },
    { type: "page" as const, label: "Check-in" },
  ];

  return (
    <PageContainer title="Check-in" header={header} breadcrumbs={breadcrumbs}>
      <PlatformBody>
        {!data.success ? <Notice tone="danger" title="Front-desk data could not be loaded">{data.error} Members, eligibility and open visits are unknown until it loads.</Notice> : null}

        <form method="get" className="flex flex-col gap-2 sm:flex-row">
          <SearchField
            name="q"
            defaultValue={q}
            label="Search members"
            placeholder="Member name, email, or phone — at least two characters"
            className="flex-1 [&_input]:h-11 [&_input]:text-base"
          />
          <Button type="submit" size="lg" className="h-11">Find member</Button>
        </form>

        <SplitLayout
          main={
            <Panel>
              <PanelHeader
                icon={UserSearch}
                title="Member lookup"
                count={searched ? data.members.length : undefined}
                description="Contact details are used to match members but are not shown here. No access decision is made until you check someone in."
              />
              {!data.success ? null : data.members.length === 0 ? (
                searched ? (
                  <EmptyBlock icon={SearchX} title="No matching members" description="Check the spelling, or search by email or phone instead. No access decision was made." />
                ) : (
                  <EmptyBlock icon={UserSearch} title="Search for a member" description="Type at least two characters of a name, email, or phone number above." />
                )
              ) : (
                <ul className="divide-y">
                  {data.members.map((member) => {
                    const canCheckIn = member.status === "active" && member.membershipEligible;
                    return (
                      <li key={member.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          <Initials name={member.name} className="size-10 text-xs" />
                          <div className="min-w-0 space-y-1.5">
                            <p className="truncate text-sm font-semibold">{member.name}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusPill tone={member.status === "active" ? "positive" : member.status === "suspended" ? "warning" : "neutral"}>
                                Account {humanize(member.status, "unknown").toLowerCase()}
                              </StatusPill>
                              <StatusPill tone={member.membershipEligible ? "positive" : "danger"}>
                                {member.membershipEligible ? "Entitlement eligible" : "Entitlement blocked"}
                              </StatusPill>
                            </div>
                            <p className={member.membershipEligible ? "text-xs text-muted-foreground" : "text-xs text-rose-700 dark:text-rose-400"}>
                              {member.membershipEligible ? "Current paid membership period" : member.entitlementReason}
                            </p>
                          </div>
                        </div>

                        <CheckInForm
                          memberId={member.id}
                          memberName={member.name}
                          locations={data.locations}
                          canCheckIn={canCheckIn}
                          blockedReason={member.entitlementReason}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          }
          aside={
            <Panel>
              <PanelHeader
                icon={DoorOpen}
                title="Open visits"
                count={data.success ? visits.total : undefined}
                description="Every visit that has not been checked out. Closed visit history is not shown here."
              />
              <form method="get" className="grid gap-2 border-b px-4 py-3 sm:px-5">
                {q ? <input type="hidden" name="q" value={q} /> : null}
                <SearchField name="vq" defaultValue={visitQuery} label="Search open visits" placeholder="Member name" />
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                  <label>
                    <span className="sr-only">Location</span>
                    <NativeSelect name="vloc" defaultValue={visitLocationId}>
                      <option value="">All locations</option>
                      {data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </NativeSelect>
                  </label>
                  <label>
                    <span className="sr-only">Order</span>
                    <NativeSelect name="vorder" defaultValue={visitOrder}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </NativeSelect>
                  </label>
                  <Button type="submit" variant="outline">Apply</Button>
                </div>
              </form>
              {!data.success ? null : data.checkIns.length === 0 ? (
                visitQuery || visitLocationId ? (
                  <EmptyBlock compact icon={SearchX} title="No open visits match" description="Clear the member or location filter to see every open visit." />
                ) : (
                  <EmptyBlock compact icon={DoorOpen} title="Nobody is checked in" description="Visits appear here as soon as a member is checked in." />
                )
              ) : (
                <ul className="divide-y">
                  {data.checkIns.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="w-14 shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">{formatTime(entry.checkInTime, data.timeZone)}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDay(entry.checkInTime, data.timeZone)}</p>
                      </div>
                      <div className="min-w-0 flex-1 border-l pl-3">
                        <p className="truncate text-sm font-medium">{entry.member?.name || "Unknown member"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.location?.name || "Location not recorded"} · {humanize(entry.method)}
                        </p>
                        <StatusPill tone={entry.membershipValidated ? "positive" : "warning"} className="mt-1.5">
                          {entry.membershipValidated ? "Validated" : "Pending validation"}
                        </StatusPill>
                      </div>
                      <CheckOutForm checkInId={entry.id} memberName={entry.member?.name || "member"} />
                    </li>
                  ))}
                </ul>
              )}
              {data.success && (visits.skip > 0 || visits.total > visits.skip + data.checkIns.length) ? (
                <PaginationBar
                  className="border-t px-4 py-3 sm:px-5"
                  summary={`${visits.skip + 1}–${visits.skip + data.checkIns.length} of ${visits.total}`}
                  previousHref={visits.skip > 0 ? visitHref(Math.max(0, visits.skip - visits.pageSize)) : null}
                  nextHref={visits.total > visits.skip + data.checkIns.length ? visitHref(visits.skip + visits.pageSize) : null}
                />
              ) : null}
            </Panel>
          }
        />
      </PlatformBody>
    </PageContainer>
  );
}

export default CheckInPage;
