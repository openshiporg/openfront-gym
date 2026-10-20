"use client";

import Link from "next/link";
import { ArrowUpRight, MoreHorizontal, SearchX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyBlock, Initials, StatusPill, type Tone } from "@/features/platform/components/platform-ui";

export type MemberStatus = "active" | "suspended" | "cancelled";
export interface MemberSummary {
  id: string; name: string; email: string; phone?: string | null; status?: MemberStatus | null;
  joinDate?: string | null; lastCheckIn?: string | null;
  membershipTier?: { id: string; name?: string | null } | null;
  user?: { id: string } | null;
  bookingsCount?: number | null; paymentsCount?: number | null; checkInsCount?: number | null;
}

interface Props {
  members: MemberSummary[];
  viewProfileBasePath: string;
  suspendMember: (formData: FormData) => Promise<void>;
  /** Current people-management capability: account actions are offered only with it. */
  canManagePeople?: boolean;
  hasFilters?: boolean;
  resetHref?: string;
}

const statusTone: Record<MemberStatus, Tone> = {
  active: "positive",
  suspended: "warning",
  cancelled: "danger",
};

const statusLabel: Record<MemberStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

const columns = "lg:grid-cols-[minmax(0,2.2fr)_7.5rem_minmax(0,1.3fr)_8.5rem_7.5rem_6.5rem]";

// Staff never issue or see password links: members recover their own account with Forgot password.
export default function MemberDirectoryClient({ members, viewProfileBasePath, suspendMember, canManagePeople = false, hasFilters = false, resetHref }: Props) {
  if (!members.length) {
    return hasFilters ? (
      <EmptyBlock
        icon={SearchX}
        title="No members match this view"
        description="Adjust the search, status, plan, or joined-date filters to widen the directory."
        action={resetHref ? <Button asChild variant="outline" size="sm"><Link href={resetHref}>Clear filters</Link></Button> : null}
      />
    ) : (
      <EmptyBlock
        icon={Users}
        title="No members yet"
        description={canManagePeople ? "Invite your first member. They choose a plan after signing in." : "Members appear here once they join or are invited."}
      />
    );
  }

  return (
    <div role="table" aria-label="Members" className="min-w-0">
      <div role="row" className={`hidden gap-4 border-b bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground lg:grid ${columns}`}>
        <span role="columnheader">Member</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Plan</span>
        <span role="columnheader">Activity</span>
        <span role="columnheader">Last visit</span>
        <span role="columnheader" className="text-right"><span className="sr-only">Actions</span></span>
      </div>
      <div className="divide-y">
        {members.map((member) => {
          const status = member.status ?? "active";
          const canClose = !member.membershipTier && (member.bookingsCount ?? 0) === 0 && (member.paymentsCount ?? 0) === 0 && (member.checkInsCount ?? 0) === 0;
          const joined = formatDate(member.joinDate);
          const lastVisit = formatDate(member.lastCheckIn);
          const profileHref = `${viewProfileBasePath}/${member.id}`;
          return (
            <div key={member.id} role="row" className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30 lg:gap-y-0 ${columns}`}>
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <Initials name={member.name} />
                <div className="min-w-0">
                  <Link href={profileHref} className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline">
                    {member.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email}
                    {member.phone ? <span className="hidden sm:inline"> · {member.phone}</span> : null}
                  </p>
                </div>
              </div>

              <div role="cell" className="justify-self-end lg:justify-self-start">
                <StatusPill tone={statusTone[status]}>{statusLabel[status]}</StatusPill>
              </div>

              <div role="cell" className="col-span-2 min-w-0 pl-11 lg:col-span-1 lg:pl-0">
                <p className={member.membershipTier ? "truncate text-sm text-foreground" : "truncate text-sm text-amber-700 dark:text-amber-400"}>
                  {member.membershipTier?.name ?? "No plan assigned"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{joined ? `Joined ${joined}` : "Join date not recorded"}</p>
              </div>

              <div role="cell" className="hidden text-xs tabular-nums text-muted-foreground lg:block">
                <p><span className="font-medium text-foreground">{member.bookingsCount ?? 0}</span> bookings</p>
                <p><span className="font-medium text-foreground">{member.checkInsCount ?? 0}</span> check-ins</p>
              </div>

              <div role="cell" className="hidden text-sm tabular-nums lg:block">
                {lastVisit ?? <span className="text-muted-foreground">Never</span>}
              </div>

              <div role="cell" className="col-span-2 flex items-center justify-between gap-2 pl-11 lg:col-span-1 lg:justify-end lg:pl-0">
                <p className="text-xs tabular-nums text-muted-foreground lg:hidden">
                  {member.bookingsCount ?? 0} bookings · {member.checkInsCount ?? 0} check-ins · last visit {lastVisit ?? "never"}
                </p>
                <div className="flex items-center gap-1">
                  <Button asChild size="sm" variant="ghost" className="hidden xl:inline-flex">
                    <Link href={profileHref}>Open <ArrowUpRight aria-hidden /></Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="size-8" aria-label={`Actions for ${member.name}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="truncate">{member.name}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild><Link href={profileHref}>Open profile</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><a href={`mailto:${member.email}`}>Send email</a></DropdownMenuItem>
                      {status !== "cancelled" && canManagePeople ? <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild><form action={suspendMember}><input type="hidden" name="memberId" value={member.id} /><input type="hidden" name="status" value={status === "suspended" ? "active" : "suspended"} /><button type="submit" className="w-full text-left">{status === "suspended" ? "Reactivate account" : "Suspend account"}</button></form></DropdownMenuItem>
                        {canClose ? <DropdownMenuItem asChild><form action={suspendMember} onSubmit={(event) => { if (!window.confirm("Close this incomplete account? This is allowed only when no operational history exists and cannot be reversed here.")) event.preventDefault() }}><input type="hidden" name="memberId" value={member.id} /><input type="hidden" name="status" value="cancelled" /><button type="submit" className="w-full text-left text-destructive">Close incomplete account</button></form></DropdownMenuItem> : null}
                      </> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
