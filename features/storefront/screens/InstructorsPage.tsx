import { Metadata } from "next"
import Link from "next/link"
import { getInstructors } from "@/features/storefront/lib/data/instructors"
import { Award, Star } from "lucide-react"

export const metadata: Metadata = {
  title: "Our Instructors - Openfront Gym",
  description: "Meet our expert fitness instructors.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Our Instructors - Openfront Gym",
    description: "Meet our expert fitness instructors.",
  }
}

// Helper to get bio text
function getBioText(bio: any): string {
  if (!bio?.document?.[0]?.children?.[0]?.text) {
    return "Expert fitness instructor passionate about helping you achieve your goals.";
  }
  return bio.document[0].children[0].text;
}

export async function InstructorsPage() {
  const instructors = await getInstructors();

  return (
    <div className="container py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Our Instructors</h1>
        <p className="text-lg text-muted-foreground">
          Meet the expert trainers who will guide you on your fitness journey
        </p>
      </div>

      {instructors.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg">
          <p className="text-muted-foreground">No instructors available at this time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {instructors.map((instructor) => (
            <Link
              key={instructor.id}
              href={`/instructors/${instructor.id}`}
              className="group border rounded-xl overflow-hidden hover:shadow-lg transition-all"
            >
              <div className="relative h-64 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
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
                <div className="absolute top-4 right-4 bg-primary/90 text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  Expert
                </div>
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                  {instructor.user.name}
                </h3>

                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {getBioText(instructor.bio)}
                </p>

                {instructor.specialties && instructor.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {instructor.specialties.slice(0, 3).map((specialty: string, index: number) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-md"
                      >
                        {specialty}
                      </span>
                    ))}
                    {instructor.specialties.length > 3 && (
                      <span className="px-2 py-1 bg-muted text-muted-foreground text-xs font-medium rounded-md">
                        +{instructor.specialties.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {instructor.certifications && instructor.certifications.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Award className="w-4 h-4" />
                    <span>{instructor.certifications.length} certifications</span>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t">
                  <span className="text-sm font-semibold text-primary group-hover:underline">
                    View Profile →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
