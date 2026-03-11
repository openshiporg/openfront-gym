import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Clock, Flame, Dumbbell, ChevronLeft, Calendar } from "lucide-react"
import { getClassTypeById, getSchedulesByClassType } from "@/features/storefront/lib/data/classes"

// Helper to get description text
function getDescriptionText(description: any): string {
  if (!description?.document?.[0]?.children?.[0]?.text) {
    return "Join us for this exciting fitness class.";
  }
  return description.document[0].children[0].text;
}

// Helper to get difficulty color
function getDifficultyColor(difficulty: string): string {
  const colors: Record<string, string> = {
    'beginner': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'intermediate': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'advanced': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'all-levels': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };
  return colors[difficulty] || 'bg-primary/10 text-primary';
}

// Map day codes
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
  const classType = await getClassTypeById(params.id)

  if (!classType) {
    return {
      title: 'Class Not Found - Openfront Gym',
    }
  }

  return {
    title: `${classType.name} - Openfront Gym`,
    description: getDescriptionText(classType.description),
  }
}

export async function ClassDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  const classType = await getClassTypeById(params.id) as any

  if (!classType) {
    notFound()
  }

  const schedules = await getSchedulesByClassType(params.id) as any[]
  const description = getDescriptionText(classType.description)

  return (
    <div className="container py-8 md:py-12">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/classes"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to classes
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getDifficultyColor(classType.difficulty)}`}>
                {classType.difficulty?.replace('-', ' ') || 'All Levels'}
              </span>
              {classType.caloriesBurn && (
                <div className="flex items-center gap-1 text-sm font-semibold">
                  <Flame className="w-4 h-4 text-orange-500" />
                  {classType.caloriesBurn} cal
                </div>
              )}
            </div>
            <h1 className="text-4xl font-bold mb-4">{classType.name}</h1>
            <p className="text-lg text-muted-foreground">{description}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
              <Clock className="w-6 h-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{classType.duration}</div>
              <div className="text-sm text-muted-foreground">minutes</div>
            </div>
            <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
              <Flame className="w-6 h-6 mx-auto mb-2 text-orange-500" />
              <div className="text-2xl font-bold">{classType.caloriesBurn || 'N/A'}</div>
              <div className="text-sm text-muted-foreground">calories</div>
            </div>
            <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
              <Calendar className="w-6 h-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{schedules.length}</div>
              <div className="text-sm text-muted-foreground">sessions/week</div>
            </div>
          </div>

          {/* Equipment */}
          {classType.equipmentNeeded && classType.equipmentNeeded.length > 0 && (
            <div className="border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Dumbbell className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-bold">Equipment Needed</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {classType.equipmentNeeded.map((item: string, index: number) => (
                  <span key={index} className="px-3 py-1 bg-muted rounded-full text-sm">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div className="border rounded-xl p-6">
            <h2 className="text-xl font-bold mb-6">Weekly Schedule</h2>
            {schedules.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No sessions scheduled at the moment. Check back soon!
              </p>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule: any) => (
                  <div key={schedule.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="min-w-[100px]">
                        <div className="font-semibold">
                          {schedule.dayOfWeek?.map((d: string) => dayCodeToName[d]).join(', ')}
                        </div>
                        <div className="text-sm text-muted-foreground">{schedule.startTime}</div>
                      </div>
                      <div className="text-sm">
                        <div>with {schedule.instructor?.name || 'TBD'}</div>
                        {schedule.room && (
                          <div className="text-muted-foreground">{schedule.room}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {schedule.spotsAvailable} / {schedule.totalCapacity}
                      </div>
                      <div className="text-xs text-muted-foreground">spots</div>
                    </div>
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
              <h3 className="font-bold text-lg mb-4">Ready to Book?</h3>
              <p className="text-sm text-muted-foreground mb-6">
                View our full schedule to book your spot in this class
              </p>
              <Link
                href="/schedule"
                className="block w-full bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg text-sm font-bold text-center transition-colors shadow-lg shadow-primary/20"
              >
                View Schedule
              </Link>
            </div>

            <div className="border rounded-xl p-6">
              <h3 className="font-semibold mb-3">Need Help?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Have questions about this class? Our team is here to help.
              </p>
              <Link
                href="/contact"
                className="text-sm text-primary hover:underline font-medium"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
