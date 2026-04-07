import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Clock, Flame, Dumbbell, ChevronLeft, Calendar } from "lucide-react"
import { getClassTypeById, getSchedulesByClassType } from "@/features/storefront/lib/data/classes"

function getDescriptionText(description: any): string {
  if (!description?.document?.[0]?.children?.[0]?.text) {
    return "Join us for this exciting fitness class.";
  }
  return description.document[0].children[0].text;
}

const DIFFICULTY_LABEL: Record<string, { label: string; color: string }> = {
  beginner: { label: "Balanced", color: "#a5b4fc" },
  intermediate: { label: "Intense", color: "#818cf8" },
  advanced: { label: "Elite", color: "#4f46e5" },
  "all-levels": { label: "Mixed", color: "#a5b4fc" },
};

const dayCodeToName: Record<string, string> = {
  'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday',
  'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday',
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params
  const classType = await getClassTypeById(params.id)
  if (!classType) return { title: 'Class Not Found - Openfront Gym' }
  return {
    title: `${classType.name} — Openfront Gym`,
    description: getDescriptionText(classType.description),
  }
}

export async function ClassDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const classType = await getClassTypeById(params.id) as any
  if (!classType) notFound()

  const schedules = await getSchedulesByClassType(params.id) as any[]
  const description = getDescriptionText(classType.description)
  const diff = DIFFICULTY_LABEL[classType.difficulty] ?? { label: "All Levels", color: "#a5b4fc" }

  return (
    <div className="min-h-screen bg-[#131313] px-4 pb-24 pt-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Back link */}
        <Link
          href="/classes"
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#c4c7c7] transition-colors hover:text-[#818cf8]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Training catalog
        </Link>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_340px]">
          {/* Main */}
          <div className="space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: diff.color }}
                >
                  {diff.label}
                </span>
                {classType.caloriesBurn && (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c4c7c7]">
                    <Flame className="h-3.5 w-3.5 text-[#818cf8]" />
                    {classType.caloriesBurn} cal
                  </span>
                )}
              </div>
              <h1 className="gym-heading">{classType.name}</h1>
              <p className="gym-callout mt-6 max-w-xl">{description}</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-px bg-white/[0.06]">
              <div className="flex flex-col items-center justify-center gap-2 bg-[#1c1b1b] py-7">
                <Clock className="h-5 w-5 text-[#818cf8]" />
                <div className="gym-stat-value text-2xl">{classType.duration}</div>
                <div className="gym-stat-label">minutes</div>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 bg-[#1c1b1b] py-7">
                <Flame className="h-5 w-5 text-[#818cf8]" />
                <div className="gym-stat-value text-2xl">{classType.caloriesBurn || '—'}</div>
                <div className="gym-stat-label">calories</div>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 bg-[#1c1b1b] py-7">
                <Calendar className="h-5 w-5 text-[#818cf8]" />
                <div className="gym-stat-value text-2xl">{schedules.length}</div>
                <div className="gym-stat-label">sessions/wk</div>
              </div>
            </div>

            {/* Equipment */}
            {classType.equipmentNeeded && classType.equipmentNeeded.length > 0 && (
              <div className="bg-[#1c1b1b] p-8">
                <div className="flex items-center gap-3 mb-5">
                  <Dumbbell className="h-5 w-5 text-[#818cf8]" />
                  <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white">
                    Equipment needed
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {classType.equipmentNeeded.map((item: string) => (
                    <span key={item} className="gym-tag">{item}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="bg-[#1c1b1b] p-8">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="h-5 w-5 text-[#818cf8]" />
                <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-black uppercase tracking-[-0.04em] text-white">
                  Weekly schedule
                </h2>
              </div>
              {schedules.length === 0 ? (
                <p className="text-sm uppercase tracking-[0.14em] text-[#c4c7c7]">
                  No sessions scheduled at the moment. Check back soon.
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
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#c4c7c7]">
                            {schedule.startTime}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm uppercase tracking-[0.1em] text-[#c4c7c7]">
                            with {schedule.instructor?.name || 'TBD'}
                          </div>
                          {schedule.room && (
                            <div className="mt-0.5 text-xs text-[#c4c7c7]/60">{schedule.room}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:text-right">
                        <div>
                          <div className="font-[family-name:var(--font-space-grotesk)] text-lg font-black tracking-[-0.04em] text-white">
                            {schedule.spotsAvailable} / {schedule.totalCapacity}
                          </div>
                          <div className="text-[9px] uppercase tracking-[0.18em] text-[#c4c7c7]">spots</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="sticky top-24 space-y-4">
              {/* Book CTA */}
              <div className="relative overflow-hidden bg-[#1c1b1b] p-8">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#818cf8_0%,#4f46e5_100%)]" />
                <h3 className="font-[family-name:var(--font-space-grotesk)] text-2xl font-black uppercase tracking-[-0.04em] text-white">
                  Ready to book?
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#c4c7c7]">
                  View the full schedule and book your spot in this class.
                </p>
                <Link href="/schedule" className="gym-btn-primary mt-6 block w-full text-center">
                  View schedule
                </Link>
              </div>

              {/* Help */}
              <div className="bg-[#0e0e0e] border border-white/10 p-6">
                <h4 className="text-xs font-bold uppercase tracking-[0.22em] text-[#c4c7c7]">Need help?</h4>
                <p className="mt-2 text-sm leading-relaxed text-[#c4c7c7]">
                  Have questions about this class? Our team is here to help.
                </p>
                <Link href="/contact" className="gym-btn-ghost mt-4 inline-flex">
                  Contact us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
