import { Metadata } from "next"
import Link from "next/link"
import { getUpcomingBookings, getBookingHistory } from "@/features/storefront/lib/data/bookings"
import { keystoneContext } from "@/features/keystone/context"
import BookingsList from "@/features/storefront/modules/account/components/bookings-list"

export const metadata: Metadata = {
  title: "My Account - Openfront Gym",
  description: "Manage your membership, bookings, and profile.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "My Account - Openfront Gym",
    description: "Manage your membership, bookings, and profile.",
  }
}

async function getMemberData() {
  const context = keystoneContext.sudo();

  // TODO: Get actual user from session - for now using first user as demo
  const users = await context.query.User.findMany({
    take: 1,
    query: `
      id
      name
      email
      role {
        isInstructor
      }
      membership {
        id
        status
        tier {
          name
          classCreditsPerMonth
        }
        classCreditsRemaining
        nextBillingDate
      }
    `,
  });

  if (!users.length) {
    return null;
  }

  return users[0];
}

export async function AccountPage() {
  const member = await getMemberData();

  if (!member) {
    return (
      <div className="container py-8 md:py-12">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Account Not Found</h1>
          <p className="text-muted-foreground mb-6">
            Please sign in to view your account.
          </p>
          <Link
            href="/auth/signin"
            className="inline-block bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const upcomingBookings = await getUpcomingBookings(member.id as string);
  const bookingHistory = await getBookingHistory(member.id as string);

  const memberData: any = member;
  const hasUnlimitedCredits = memberData.membership?.tier?.classCreditsPerMonth === -1;
  const creditsRemaining = hasUnlimitedCredits ? -1 : (memberData.membership?.classCreditsRemaining || 0);
  const totalCredits = memberData.membership?.tier?.classCreditsPerMonth || 0;

  return (
    <div className="container py-8 md:py-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Welcome back, {memberData.name?.split(" ")[0] || "Member"}
          </h1>
          <p className="text-muted-foreground">
            Manage your membership and bookings
          </p>
          {memberData.role?.isInstructor && (
            <Link
              href="/account/instructor"
              className="mt-3 inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              Open Instructor Console
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Membership status */}
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Membership</h3>
            {memberData.membership ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{memberData.membership.tier?.name || "N/A"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`font-medium capitalize ${
                    memberData.membership.status === 'active' ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {memberData.membership.status}
                  </span>
                </div>
                {memberData.membership.nextBillingDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Renews</span>
                    <span>{new Date(memberData.membership.nextBillingDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active membership</p>
            )}
          </div>

          {/* Class credits */}
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Class Credits</h3>
            <div className="text-center">
              {hasUnlimitedCredits ? (
                <>
                  <div className="text-4xl font-bold text-primary mb-1">∞</div>
                  <div className="text-sm text-muted-foreground">Unlimited</div>
                </>
              ) : (
                <>
                  <div className="text-4xl font-bold text-primary mb-1">
                    {creditsRemaining}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    of {totalCredits} remaining this month
                  </div>
                  <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${totalCredits > 0 ? (creditsRemaining / totalCredits) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/schedule"
                className="block w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium text-center"
              >
                Book a Class
              </Link>
              <Link
                href="/memberships"
                className="block w-full border border-input hover:bg-accent px-4 py-2 rounded-md text-sm font-medium text-center"
              >
                View Memberships
              </Link>
            </div>
          </div>
        </div>

        {/* Upcoming bookings */}
        <BookingsList
          upcomingBookings={upcomingBookings}
          bookingHistory={bookingHistory}
        />
      </div>
    </div>
  )
}
