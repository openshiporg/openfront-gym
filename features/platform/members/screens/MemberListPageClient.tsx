"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MemberStatus = "active" | "suspended" | "cancelled";
export interface MemberSummary {
  id: string; name: string; email: string; phone?: string | null; status?: MemberStatus | null;
  joinDate?: string | null; lastCheckIn?: string | null;
  membershipTier?: { id: string; name?: string | null } | null;
  bookingsCount?: number | null; paymentsCount?: number | null; checkInsCount?: number | null;
}

interface Props {
  members: MemberSummary[];
  viewProfileBasePath: string;
  suspendMember: (formData: FormData) => Promise<void>;
}

const statusStyles: Record<string, string> = {
  active: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100",
  suspended: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
  cancelled: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function MemberDirectoryClient({ members, viewProfileBasePath, suspendMember }: Props) {
  if (!members.length) return <div className="rounded-lg border border-dashed bg-card px-6 py-14 text-center"><p className="font-medium">No members match this view.</p><p className="mt-1 text-sm text-muted-foreground">Adjust the search, status, tier, or joined-date filters.</p></div>;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_120px_150px_48px] gap-4 border-b bg-muted/30 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
        <span>Member</span><span>Membership</span><span>Activity</span><span>Last visit</span><span><span className="sr-only">Actions</span></span>
      </div>
      <div className="divide-y">
        {members.map((member) => {
          const status = member.status ?? "active";
          const canClose = !member.membershipTier && (member.bookingsCount ?? 0) === 0 && (member.paymentsCount ?? 0) === 0 && (member.checkInsCount ?? 0) === 0;
          return (
            <details key={member.id} className="group open:bg-muted/20">
              <summary className="grid cursor-pointer list-none gap-3 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_120px_150px_48px] lg:items-center">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`${viewProfileBasePath}/${member.id}`} className="truncate font-semibold underline-offset-4 hover:underline" onClick={(event) => event.stopPropagation()}>{member.name}</Link><Badge variant="outline" className={statusStyles[status]}>{status}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">{member.email}{member.phone ? ` · ${member.phone}` : ""}</p></div>
                <div><p className="text-sm font-medium">{member.membershipTier?.name ?? "No plan assigned"}</p><p className="mt-1 text-xs text-muted-foreground">Joined {formatDate(member.joinDate)}</p></div>
                <div className="text-sm tabular-nums"><span className="font-medium">{member.bookingsCount ?? 0}</span> bookings<p className="text-xs text-muted-foreground">{member.checkInsCount ?? 0} check-ins</p></div>
                <div className="text-sm">{formatDate(member.lastCheckIn)}</div>
                <span className="text-right text-muted-foreground group-open:rotate-180" aria-hidden="true">⌄</span>
              </summary>
              <div className="grid gap-4 border-t px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Bookings</dt><dd className="font-medium tabular-nums">{member.bookingsCount ?? 0}</dd></div><div><dt className="text-xs text-muted-foreground">Payments</dt><dd className="font-medium tabular-nums">{member.paymentsCount ?? 0}</dd></div><div><dt className="text-xs text-muted-foreground">Check-ins</dt><dd className="font-medium tabular-nums">{member.checkInsCount ?? 0}</dd></div><div><dt className="text-xs text-muted-foreground">Account state</dt><dd className="font-medium capitalize">{status}</dd></div></dl>
                <div className="flex items-center justify-end gap-2">
                  <Button asChild size="sm" variant="outline"><Link href={`${viewProfileBasePath}/${member.id}`}>Open profile</Link></Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="outline" aria-label={`Actions for ${member.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Member actions</DropdownMenuLabel><DropdownMenuSeparator />
                      <DropdownMenuItem asChild><a href={`mailto:${member.email}`}>Send email</a></DropdownMenuItem>
                      {status !== "cancelled" ? <>
                        <DropdownMenuItem asChild><form action={suspendMember}><input type="hidden" name="memberId" value={member.id} /><input type="hidden" name="status" value={status === "suspended" ? "active" : "suspended"} /><button type="submit" className="w-full text-left">{status === "suspended" ? "Reactivate account" : "Suspend account"}</button></form></DropdownMenuItem>
                        {canClose ? <DropdownMenuItem asChild><form action={suspendMember} onSubmit={(event) => { if (!window.confirm("Close this incomplete account? This is allowed only when no operational history exists and cannot be reversed here.")) event.preventDefault() }}><input type="hidden" name="memberId" value={member.id} /><input type="hidden" name="status" value="cancelled" /><button type="submit" className="w-full text-left text-destructive">Close incomplete account</button></form></DropdownMenuItem> : null}
                      </> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
