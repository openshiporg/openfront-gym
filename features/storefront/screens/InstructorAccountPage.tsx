import Link from "next/link";
import { Calendar, Users, Clock, AlertCircle } from "lucide-react";
import { keystoneContext } from "@/features/keystone/context";

async function getInstructorData() {
  const context = keystoneContext.sudo();

  // TODO: replace with authenticated storefront session user
  const users = await context.query.User.findMany({
    take: 1,
    query: `
      id
      name
      email
      role { isInstructor }
    `,
  });

  const user = users[0];
  if (!user || !user.role?.isInstructor) return null;

  const instructors = await context.query.Instructor.findMany({
    where: {
      user: { id: { equals: user.id } },
      isActive: { equals: true },
    },
    take: 1,
    query: `
      id
      specialties
      classSchedules {
        id
        name
        dayOfWeek
        startTime
        endTime
        maxCapacity
      }
      classInstances(
        where: { date: { gte: "${new Date().toISOString()}" } }
        orderBy: { date: asc }
        take: 10
      ) {
        id
        date
        isCancelled
        classSchedule { name maxCapacity }
        bookingsCount
      }
    `,
  });

  return {
    user,
    instructor: instructors[0] ?? null,
  };
}

export async function InstructorAccountPage() {
  const data = await getInstructorData();

  if (!data) {
    return (
      <div className="container py-10">
        <div className="max-w-3xl mx-auto rounded-xl border bg-card p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">Instructor Access Required</h1>
          <p className="mt-2 text-muted-foreground">
            Your account is not configured as an instructor.
          </p>
          <Link href="/account" className="mt-6 inline-block text-primary hover:underline">
            Back to account
          </Link>
        </div>
      </div>
    );
  }

  const { user, instructor } = data;

  return (
    <div className="container py-8 md:py-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Instructor Console</h1>
          <p className="text-muted-foreground">Welcome, {user.name}. Manage your classes and attendance.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-2"><Calendar className="h-4 w-4 text-primary" /><span className="text-sm text-muted-foreground">Upcoming Classes</span></div>
            <div className="text-2xl font-bold">{instructor?.classInstances?.length ?? 0}</div>
          </div>
          <div className="rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-primary" /><span className="text-sm text-muted-foreground">Schedules</span></div>
            <div className="text-2xl font-bold">{instructor?.classSchedules?.length ?? 0}</div>
          </div>
          <div className="rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-2"><Clock className="h-4 w-4 text-primary" /><span className="text-sm text-muted-foreground">Primary Skills</span></div>
            <div className="text-sm font-medium">{(instructor?.specialties || []).slice(0, 3).join(", ") || "General"}</div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">My Upcoming Sessions</h2>
            <Link href="/dashboard/platform/scheduling" className="text-sm text-primary hover:underline">Open full calendar</Link>
          </div>

          <div className="space-y-3">
            {(instructor?.classInstances || []).map((session: any) => (
              <div key={session.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{session.classSchedule?.name || "Class"}</div>
                  <div className="text-sm text-muted-foreground">{new Date(session.date).toLocaleString()}</div>
                </div>
                <div className="text-sm text-muted-foreground">{session.bookingsCount || 0}/{session.classSchedule?.maxCapacity || 0} booked</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
