import { Metadata } from "next"
import ClassGrid from "@/features/storefront/modules/classes/components/class-grid"
import ClassFilters from "@/features/storefront/modules/classes/components/class-filters"

export const metadata: Metadata = {
  title: "Classes - Openfront Gym",
  description: "Browse and book fitness classes. Yoga, Spin, HIIT, Strength Training and more.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Classes - Openfront Gym",
    description: "Browse and book fitness classes. Yoga, Spin, HIIT, Strength Training and more.",
  }
}

export async function ClassesPage() {
  return (
    <div className="container py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Fitness Classes</h1>
        <p className="text-muted-foreground">
          Find the perfect class for your fitness goals
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1">
          <ClassFilters />
        </aside>
        <main className="lg:col-span-3">
          <ClassGrid />
        </main>
      </div>
    </div>
  )
}
