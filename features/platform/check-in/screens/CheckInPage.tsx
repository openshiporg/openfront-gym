import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFrontDeskData, manualCheckIn, manualCheckOut } from "../actions/check-in";

function formatDateTime(value: string | null | undefined, timeZone: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export async function CheckInPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const q = resolved?.q ?? "";
  const data = await getFrontDeskData(q);
  const openVisitsRecent = data.checkIns.length;
  const validatedRecent = data.checkIns.filter((entry) => entry.membershipValidated).length;
  const eligibleMatches = data.members.filter((member) => member.status === "active" && member.membershipEligible).length;

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Front desk check-in</h1>
      <p className="text-muted-foreground">Confirm identity and current membership eligibility; the server rechecks hours, policy, and location when recording entry.</p>
    </div>
  );

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "page" as const, label: "Check-in" },
  ];

  return (
    <PageContainer title="Check-in" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full min-w-0 space-y-5 p-4 md:p-6">
        <div className="grid grid-cols-3 divide-x rounded-lg border bg-card">
          <div className="p-3"><p className="text-xs text-muted-foreground">Open visits shown (up to 12)</p><p className="mt-1 text-2xl font-semibold tabular-nums">{openVisitsRecent}</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">Validated open visits</p><p className="mt-1 text-2xl font-semibold tabular-nums">{validatedRecent}</p></div>
          <div className="p-3"><p className="text-xs text-muted-foreground">Eligible search matches</p><p className="mt-1 text-2xl font-semibold tabular-nums">{eligibleMatches}</p></div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <form method="get" className="flex flex-col gap-3 sm:flex-row">
            <label className="min-w-0 flex-1"><span className="sr-only">Search members</span><Input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search member name, email, or phone"
              className="h-11"
            /></label>
            <Button type="submit">Search</Button>
          </form>
          <div className="flex flex-col gap-3 rounded-md border border-dashed border-border/80 bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Need the kiosk-style entrance flow?</p>
              <p className="text-xs text-muted-foreground mt-1">Open the dedicated check-in kiosk for QR-based member entry, fallback search, and guest check-ins.</p>
            </div>
            <Button asChild variant="outline">
              <a href="/kiosk/check-in" target="_blank" rel="noreferrer">Open kiosk</a>
            </Button>
          </div>
        </div>

        {!data.success && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {data.error}
          </div>
        )}

        <div className="grid min-w-0 gap-6 lg:grid-cols-[1.25fr_0.9fr]">
          <section className="min-w-0 rounded-lg border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Member lookup</h2>
              <p className="text-xs text-muted-foreground mt-1">Search by name, email, or phone. Contact details are used to match members but are not displayed in results.</p>
            </div>

            <div className="divide-y">
              {data.members.length === 0 ? (
                <div className="px-5 py-10"><p className="text-sm font-medium">{q.trim().length >= 2 ? "No matching members." : "Search for a member."}</p><p className="mt-1 text-xs text-muted-foreground">Search with at least two characters by name, email, or phone. No access decision was made.</p></div>
              ) : (
                data.members.map((member) => {
                  const canCheckIn = member.status === "active" && member.membershipEligible;

                  return (
                    <div key={member.id} className="px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{member.name}</p>
                          <Badge variant="outline" className="capitalize">{member.status ?? "unknown"}</Badge>
                          <Badge className={member.membershipEligible ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                            {member.membershipEligible ? "Entitlement eligible" : "Entitlement blocked"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {member.membershipEligible ? "Current paid membership period" : member.entitlementReason}
                        </p>
                      </div>

                      <form action={manualCheckIn} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                        <input type="hidden" name="memberId" value={member.id} />
                        <input type="hidden" name="method" value="manual" />
                        <label><span className="sr-only">Check-in location for {member.name}</span><select
                          name="locationId"
                          className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm sm:min-w-[180px]"
                          defaultValue={data.locations[0]?.id ?? ""}
                        >
                          {data.locations.map((location) => (
                            <option key={location.id} value={location.id}>{location.name || "Unnamed location"}</option>
                          ))}
                        </select></label>
                        <Button type="submit" disabled={!canCheckIn} title={!canCheckIn ? member.entitlementReason : undefined}>
                          {canCheckIn ? "Check in" : "Access blocked"}
                        </Button>
                      </form>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-lg border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Current open visits</h2>
              <p className="text-xs text-muted-foreground mt-1">Only unclosed visits are shown (up to 12); closed visit history is not loaded here.</p>
            </div>
            <div className="divide-y">
              {data.checkIns.length === 0 ? (
                <div className="px-5 py-10 text-sm text-muted-foreground">No check-ins yet.</div>
              ) : (
                data.checkIns.map((entry) => (
                  <div key={entry.id} className="px-5 py-4 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate">{entry.member?.name || "Unknown member"}</p>
                      <Badge variant="outline" className="capitalize">{entry.method.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {entry.location?.name || "Location not recorded"}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.checkInTime, data.timeZone)}
                        {entry.membershipValidated ? " · validated" : " · pending validation"}
                      </p>
                      <form action={manualCheckOut}>
                        <input type="hidden" name="checkInId" value={entry.id} />
                        <Button type="submit" variant="outline" size="sm">Check out</Button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

export default CheckInPage;
