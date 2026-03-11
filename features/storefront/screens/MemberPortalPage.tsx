import { Metadata } from "next"
import { redirect } from "next/navigation"
import { keystoneContext } from "@/features/keystone/context"
import { Calendar, CreditCard, User, TrendingUp, Award } from "lucide-react"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Member Portal - Openfront Gym",
  description: "View your bookings, membership status, and workout progress",
}

export async function generateMetadata(): Promise<Metadata> {
  return metadata
}

async function getMemberData() {
  const context = keystoneContext.sudo()

  // TODO: Get actual user from session - for now using first user as demo
  const users = await context.query.User.findMany({
    take: 1,
    query: `
      id
      name
      email
    `,
  })

  if (!users.length) {
    return null
  }

  const user = users[0]

  // Get member record
  const members = await context.query.Member.findMany({
    where: {
      user: { id: { equals: user.id } },
    },
    take: 1,
    query: `
      id
      name
      email
      phone
      joinDate
      membershipTier {
        id
        name
        price
        billingInterval
      }
      status
    `,
  })

  const member = members[0]

  // Get upcoming bookings
  const bookings = await context.query.ClassBooking.findMany({
    where: {
      member: { id: { equals: member?.id } },
      status: { equals: "confirmed" },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    query: `
      id
      status
      createdAt
      classInstance {
        id
        startTime
        classSchedule {
          id
          name
          instructor {
            id
            user {
              name
            }
          }
        }
      }
    `,
  })

  return {
    user,
    member,
    bookings,
  }
}

export async function MemberPortalPage() {
  const data = await getMemberData()

  if (!data || !data.user) {
    redirect("/auth/signin")
  }

  const { user, member, bookings } = data

  const upcomingBookings = bookings || []

  return (
    <div className="min-h-screen bg-muted/30 py-12">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Welcome back, {user.name}!
          </h1>
          <p className="text-muted-foreground">
            Manage your membership, bookings, and fitness journey
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingBookings.length}</p>
                <p className="text-xs text-muted-foreground">Upcoming Classes</p>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">12</p>
                <p className="text-xs text-muted-foreground">Classes This Month</p>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center">
                <Award className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">3</p>
                <p className="text-xs text-muted-foreground">Achievements</p>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {member?.membershipTier?.name || "No Membership"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {member?.status || "Inactive"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming Bookings */}
            <div className="bg-card border rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Upcoming Classes</h2>
                <Link
                  href="/schedule"
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Book a class
                </Link>
              </div>
              <div className="space-y-4">
                {upcomingBookings.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">No upcoming bookings</p>
                    <Link
                      href="/schedule"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-md text-sm font-medium inline-flex items-center justify-center transition-colors"
                    >
                      Browse Classes
                    </Link>
                  </div>
                ) : (
                  upcomingBookings.map((booking: any) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">
                            {booking.classInstance.classSchedule.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            with {booking.classInstance.classSchedule.instructor.user.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {booking.classInstance.startTime}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2.5 py-1 bg-green-500/10 text-green-600 rounded-full font-medium">
                          Confirmed
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Workout Tracking */}
            <div className="bg-card border rounded-xl p-6">
              <h2 className="text-xl font-bold mb-6">Activity Overview</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b">
                  <div>
                    <p className="font-medium">Classes Attended</p>
                    <p className="text-sm text-muted-foreground">This month</p>
                  </div>
                  <span className="text-2xl font-bold text-primary">12</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b">
                  <div>
                    <p className="font-medium">Workout Streak</p>
                    <p className="text-sm text-muted-foreground">Current streak</p>
                  </div>
                  <span className="text-2xl font-bold text-primary">7 days</span>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Calories Burned</p>
                    <p className="text-sm text-muted-foreground">Total this month</p>
                  </div>
                  <span className="text-2xl font-bold text-primary">3,420</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Membership Card */}
            <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-xl p-6">
              <div className="mb-4">
                <p className="text-sm opacity-90 mb-1">Membership</p>
                <h3 className="text-2xl font-bold">
                  {member?.membershipTier?.name || "No Plan"}
                </h3>
              </div>
              {member?.membershipTier && (
                <>
                  <div className="mb-6">
                    <p className="text-sm opacity-90 mb-1">Monthly Payment</p>
                    <p className="text-3xl font-bold">
                      ${(member.membershipTier.price / 100).toFixed(2)}
                    </p>
                  </div>
                  <Link
                    href="/account/billing"
                    className="w-full bg-white text-primary hover:bg-white/90 px-4 py-2.5 rounded-md text-sm font-semibold inline-flex items-center justify-center transition-colors"
                  >
                    Manage Membership
                  </Link>
                </>
              )}
              {!member?.membershipTier && (
                <Link
                  href="/memberships"
                  className="w-full bg-white text-primary hover:bg-white/90 px-4 py-2.5 rounded-md text-sm font-semibold inline-flex items-center justify-center transition-colors"
                >
                  Choose a Plan
                </Link>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-bold mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Link
                  href="/schedule"
                  className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg transition-colors"
                >
                  <Calendar className="w-5 h-5 text-primary" />
                  <span className="font-medium">Book a Class</span>
                </Link>
                <Link
                  href="/account"
                  className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg transition-colors"
                >
                  <User className="w-5 h-5 text-primary" />
                  <span className="font-medium">Edit Profile</span>
                </Link>
                <Link
                  href="/account/billing"
                  className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg transition-colors"
                >
                  <CreditCard className="w-5 h-5 text-primary" />
                  <span className="font-medium">Payment History</span>
                </Link>
              </div>
            </div>

            {/* Personal Trainer */}
            <div className="bg-card border rounded-xl p-6">
              <h3 className="font-bold mb-3">Personal Training</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Accelerate your results with one-on-one coaching
              </p>
              <Link
                href="/instructors"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-md text-sm font-semibold inline-flex items-center justify-center transition-colors"
              >
                Book PT Session
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
