import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Award, Calendar, ChevronLeft, Clock, Star } from "lucide-react"
import { getInstructorById, getInstructorSchedules } from "@/features/storefront/lib/data/instructors"

// Helper to get bio text
function getBioText(bio: any): string {
  if (!bio?.document?.[0]?.children?.[0]?.text) {
    return "Expert fitness instructor passionate about helping you achieve your goals.";
  }
  return bio.document[0].children[0].text;
}

// Map day codes to day names
const dayCodeToName: Record<string, string> = {
  'sun': 'Sunday',
  'mon': 'Monday',
  'tue': 'Tuesday',
  'wed': 'Wednesday',
  'thu': 'Thursday',
  'fri': 'Friday',
  'sat': 'Saturday',
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const params = await props.params
  const instructor = await getInstructorById(params.id)

  if (!instructor) {
    return {
      title: 'Instructor Not Found - Openfront Gym',
    }
  }

  return {
    title: `${instructor.user.name} - Instructor - Openfront Gym`,
    description: getBioText(instructor.bio),
  }
}

export async function InstructorDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  const instructor = await getInstructorById(params.id)

  if (!instructor) {
    notFound()
  }

  const schedules = await getInstructorSchedules(params.id)
  const bio = getBioText(instructor.bio)

  return (
    <div className="container py-8 md:py-12">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/instructors"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to instructors
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Instructor info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row gap-6">
            <div className="relative w-full md:w-48 h-48 rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
              {instructor.photo ? (
                <img
                  src={instructor.photo}
                  alt={instructor.user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-6xl font-bold text-primary/30">
                  {instructor.user.name.charAt(0)}
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-bold">{instructor.user.name}</h1>
                <span className="bg-primary/90 text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  Expert
                </span>
              </div>
              <p className="text-lg text-muted-foreground mb-6">{bio}</p>

              {/* Specialties */}
              {instructor.specialties && instructor.specialties.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2">Specialties</h3>
                  <div className="flex flex-wrap gap-2">
                    {instructor.specialties.map((specialty: string, index: number) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-lg"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {instructor.certifications && instructor.certifications.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Certifications
                  </h3>
                  <ul className="space-y-1">
                    {instructor.certifications.map((cert: string, index: number) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {cert}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Class Schedule */}
          <div className="border rounded-xl p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Weekly Schedule
            </h2>
            {schedules.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No classes scheduled at the moment.
              </p>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule: any) => (
                  <div key={schedule.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="min-w-[100px]">
                        <div className="font-semibold">
                          {schedule.dayOfWeek?.map((d: string) => dayCodeToName[d]).join(', ')}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {schedule.startTime}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium">{schedule.name}</div>
                        {schedule.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {schedule.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <Link
                      href="/schedule"
                      className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-semibold transition-colors whitespace-nowrap"
                    >
                      Book Class
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <div className="border-2 border-primary/20 rounded-xl p-6 bg-gradient-to-br from-primary/5 to-background">
              <h3 className="font-bold text-lg mb-4">Train with {instructor.user.name.split(' ')[0]}</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Book a class and experience expert guidance to help you reach your fitness goals.
              </p>
              <Link
                href="/schedule"
                className="block w-full bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg text-sm font-bold text-center transition-colors shadow-lg shadow-primary/20"
              >
                View Schedule
              </Link>
            </div>

            <div className="border rounded-xl p-6">
              <h3 className="font-semibold mb-3">About Classes</h3>
              <p className="text-sm text-muted-foreground mb-4">
                All classes are included with your membership. Book your spot today!
              </p>
              <Link
                href="/memberships"
                className="text-sm text-primary hover:underline font-medium"
              >
                View Membership Plans
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
