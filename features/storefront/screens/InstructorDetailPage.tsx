import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Award, Calendar, ChevronLeft, Clock } from "lucide-react"
import { getInstructorById, getInstructorSchedules } from "@/features/storefront/lib/data/instructors"

function getBioText(bio: any): string {
  if (!bio?.document?.[0]?.children?.[0]?.text) {
    return "Expert fitness instructor passionate about helping you achieve your goals.";
  }
  return bio.document[0].children[0].text;
}

const dayCodeToName: Record<string, string> = {
  'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday',
  'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday',
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params
  const instructor = await getInstructorById(params.id)
  if (!instructor) return { title: 'Instructor Not Found - Openfront Gym' }
  return {
    title: `${instructor.user.name} — Instructor — Openfront Gym`,
    description: getBioText(instructor.bio),
  }
}

export async function InstructorDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const instructor = await getInstructorById(params.id)
  if (!instructor) notFound()

  const schedules = await getInstructorSchedules(params.id)
  const bio = getBioText(instructor.bio)

  const initials = instructor.user.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Back link */}
        <Link
          href="/instructors"
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7] transition-colors hover:text-[#818cf8]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Coaching team
        </Link>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
          {/* Main content */}
          <div className="space-y-10">
            {/* Header */}
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
              {/* Avatar */}
              <div className="gym-avatar h-36 w-36 shrink-0 text-6xl ring-1 ring-white/10">
                {instructor.photo ? (
                  <img
                    src={instructor.photo}
                    alt={instructor.user.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>

              <div className="flex-1">
                <p className="gym-eyebrow">Instructor</p>
                <h1 className="gym-heading">{instructor.user.name}</h1>
                <p className="gym-body mt-5 max-w-xl">{bio}</p>

                {/* Specialties */}
                {instructor.specialties && instructor.specialties.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {instructor.specialties.map((specialty: string) => (
                      <span key={specialty} className="gym-tag">{specialty}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Certifications */}
            {instructor.certifications && instructor.certifications.length > 0 && (
              <div className="bg-[#1c1b1b] p-8">
                <div className="mb-5 flex items-center gap-3">
                  <Award className="h-5 w-5 text-[#818cf8]" />
                  <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white">
                    Certifications
                  </h2>
                </div>
                <ul className="space-y-2">
                  {instructor.certifications.map((cert: string) => (
                    <li key={cert} className="flex items-center gap-3 text-sm text-[#c4c7c7]">
                      <span className="h-1.5 w-1.5 shrink-0 bg-[#818cf8]" />
                      {cert}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Schedule */}
            <div className="bg-[#1c1b1b] p-8">
              <div className="mb-6 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-[#818cf8]" />
                <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white">
                  Weekly schedule
                </h2>
              </div>
              {schedules.length === 0 ? (
                <p className="text-sm uppercase tracking-[0.14em] text-[#c4c7c7]">
                  No classes scheduled at the moment.
                </p>
              ) : (
                <div className="divide-y divide-white/10">
                  {schedules.map((schedule: any) => (
                    <div key={schedule.id} className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-8">
                        <div className="min-w-[100px]">
                          <div className="font-[family-name:var(--font-space-grotesk)] text-lg font-black uppercase tracking-[-0.03em] text-white">
                            {schedule.dayOfWeek?.map((d: string) => dayCodeToName[d]).join(', ')}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-[#c4c7c7]">
                            <Clock className="h-3 w-3" />
                            {schedule.startTime}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium uppercase tracking-[0.1em] text-white">{schedule.name}</div>
                          {schedule.description && (
                            <div className="mt-1 text-xs text-[#c4c7c7] line-clamp-1">{schedule.description}</div>
                          )}
                        </div>
                      </div>
                      <Link
                        href="/schedule"
                        className="gym-btn-primary shrink-0 px-6 py-3 text-[10px]"
                      >
                        Book class
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            <div className="sticky top-24 space-y-4">
              {/* CTA card */}
              <div className="relative overflow-hidden bg-[#1c1b1b] p-8">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#818cf8_0%,#4f46e5_100%)]" />
                <h3 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
                  Train with {instructor.user.name.split(' ')[0]}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#c4c7c7]">
                  Book a class and experience expert guidance to help you reach your fitness goals.
                </p>
                <Link href="/schedule" className="gym-btn-primary mt-6 block w-full text-center">
                  View schedule
                </Link>
              </div>

              {/* Membership nudge */}
              <div className="bg-[#0e0e0e] border border-white/10 p-6">
                <h4 className="text-xs font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">About classes</h4>
                <p className="mt-2 text-sm leading-relaxed text-[#c4c7c7]">
                  All classes are included with your membership. Book your spot today.
                </p>
                <Link href="/memberships" className="gym-btn-ghost mt-4 inline-flex">
                  View membership plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
