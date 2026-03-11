"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MemberStatus = "active" | "suspended" | "cancelled";

export interface MemberSummary {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status?: MemberStatus | null;
  joinDate?: string | null;
  lastCheckIn?: string | null;
  membershipTier?: {
    id: string;
    name?: string | null;
  } | null;
  bookingsCount?: number | null;
  paymentsCount?: number | null;
  checkInsCount?: number | null;
}

interface MemberDirectoryClientProps {
  members: MemberSummary[];
  viewProfileBasePath: string;
  suspendMember: (formData: FormData) => Promise<void>;
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-amber-100 text-amber-800",
  cancelled: "bg-rose-100 text-rose-800",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export default function MemberDirectoryClient({
  members,
  viewProfileBasePath,
  suspendMember,
}: MemberDirectoryClientProps) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <Card key={member.id}>
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{member.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {member.email || "No email"}
                  </p>
                </div>
                <Badge className={statusStyles[member.status ?? "active"]}>
                  {member.status ?? "active"}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {member.membershipTier?.name ?? "No tier"} • Joined {formatDate(member.joinDate)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-semibold">{member.bookingsCount ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Bookings</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">{member.paymentsCount ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Payments</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">{member.checkInsCount ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Check-ins</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Phone: {member.phone || "—"}</span>
                <span>Last check-in: {formatDate(member.lastCheckIn)}</span>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href={`${viewProfileBasePath}/${member.id}`}>View profile</Link>
              </Button>
              <form action={suspendMember}>
                <input type="hidden" name="memberId" value={member.id} />
                <Button
                  size="sm"
                  variant="destructive"
                  type="submit"
                  disabled={member.status === "suspended"}
                >
                  Suspend
                </Button>
              </form>
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${member.email}`}>Send message</a>
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost">
                    Details
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{member.name}</DialogTitle>
                  </DialogHeader>
                  <Tabs defaultValue="profile" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="profile">Profile</TabsTrigger>
                      <TabsTrigger value="bookings">Bookings</TabsTrigger>
                      <TabsTrigger value="payments">Payments</TabsTrigger>
                      <TabsTrigger value="checkins">Check-ins</TabsTrigger>
                    </TabsList>
                    <TabsContent value="profile" className="space-y-4 pt-4">
                      <div className="grid gap-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Email</span>
                          <span>{member.email || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Phone</span>
                          <span>{member.phone || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <span>{member.status ?? "active"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Membership tier</span>
                          <span>{member.membershipTier?.name ?? "No tier"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Join date</span>
                          <span>{formatDate(member.joinDate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last check-in</span>
                          <span>{formatDate(member.lastCheckIn)}</span>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="bookings" className="space-y-3 pt-4">
                      <div className="text-sm">Total bookings: {member.bookingsCount ?? 0}</div>
                      <div className="text-xs text-muted-foreground">
                        View full booking history in the profile page.
                      </div>
                    </TabsContent>
                    <TabsContent value="payments" className="space-y-3 pt-4">
                      <div className="text-sm">Total payments: {member.paymentsCount ?? 0}</div>
                      <div className="text-xs text-muted-foreground">
                        View payment details in the profile page.
                      </div>
                    </TabsContent>
                    <TabsContent value="checkins" className="space-y-3 pt-4">
                      <div className="text-sm">Total check-ins: {member.checkInsCount ?? 0}</div>
                      <div className="text-xs text-muted-foreground">
                        Review check-in history in the profile page.
                      </div>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Membership</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last check-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={`${member.id}-row`}>
                <TableCell>
                  <div className="font-medium">{member.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {member.email || "No email"}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={statusStyles[member.status ?? "active"]}>
                    {member.status ?? "active"}
                  </Badge>
                </TableCell>
                <TableCell>{member.membershipTier?.name ?? "No tier"}</TableCell>
                <TableCell>{formatDate(member.joinDate)}</TableCell>
                <TableCell>{formatDate(member.lastCheckIn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
