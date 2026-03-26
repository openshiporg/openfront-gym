import { PageContainer } from "@/features/dashboard/components/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFrontDeskData, manualCheckIn } from "../actions/check-in";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function CheckInPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const q = resolved?.q ?? "";
  const data = await getFrontDeskData(q);

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold md:text-2xl">Front desk check-in</h1>
      <p className="text-muted-foreground">Search members, validate active access, and record walk-in check-ins.</p>
    </div>
  );

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "/dashboard" },
    { type: "page" as const, label: "Check-in" },
  ];

  return (
    <PageContainer title="Check-in" header={header} breadcrumbs={breadcrumbs}>
      <div className="w-full p-4 md:p-6 space-y-6">
        <div className="rounded-lg border bg-background p-5">
          <form method="get" className="flex flex-col gap-3 sm:flex-row">
            <Input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search member name, email, or phone"
              className="h-11"
            />
            <Button type="submit">Search</Button>
          </form>
        </div>

        {!data.success && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {data.error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.9fr]">
          <section className="rounded-lg border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Member lookup</h2>
              <p className="text-xs text-muted-foreground mt-1">Find a member and record a front-desk check-in.</p>
            </div>

            <div className="divide-y">
              {data.members.length === 0 ? (
                <div className="px-5 py-10 text-sm text-muted-foreground">No members found for this search.</div>
              ) : (
                data.members.map((member) => {
                  const membership = member.user?.membership;
                  const canCheckIn = member.status === "active" && membership?.status === "active";
                  const creditsCopy =
                    membership?.classCreditsRemaining === -1
                      ? "Unlimited classes"
                      : typeof membership?.classCreditsRemaining === "number"
                        ? `${membership.classCreditsRemaining} credits left`
                        : "No credit data";

                  return (
                    <div key={member.id} className="px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{member.name}</p>
                          <Badge variant="outline" className="capitalize">{member.status ?? "unknown"}</Badge>
                          {membership?.status && (
                            <Badge className={membership.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                              Membership {membership.status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{member.email}{member.phone ? ` · ${member.phone}` : ""}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.membershipTier?.name ? `${member.membershipTier.name} · ` : ""}
                          {creditsCopy}
                          {member.lastCheckIn ? ` · last check-in ${formatDateTime(member.lastCheckIn)}` : ""}
                        </p>
                      </div>

                      <form action={manualCheckIn} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input type="hidden" name="memberId" value={member.id} />
                        <input type="hidden" name="method" value="manual" />
                        <select
                          name="locationId"
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
                          defaultValue={data.locations[0]?.id ?? ""}
                        >
                          {data.locations.map((location) => (
                            <option key={location.id} value={location.id}>{location.name || "Unnamed location"}</option>
                          ))}
                        </select>
                        <Button type="submit" disabled={!canCheckIn}>
                          {canCheckIn ? "Check in" : "Access blocked"}
                        </Button>
                      </form>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Recent check-ins</h2>
              <p className="text-xs text-muted-foreground mt-1">Latest validated front-desk activity across active locations.</p>
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
                      {entry.member?.email || "No email"}
                      {entry.location?.name ? ` · ${entry.location.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.checkInTime)}
                      {entry.membershipValidated ? " · validated" : " · pending validation"}
                    </p>
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
