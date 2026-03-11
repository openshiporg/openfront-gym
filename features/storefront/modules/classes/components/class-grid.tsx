import Link from "next/link"
import { Clock, Flame, Dumbbell } from "lucide-react"
import { getClassTypes, type ClassTypeData } from "@/features/storefront/lib/data/classes"

// Function to get description text from document field
function getDescriptionText(description: any): string {
  if (!description?.document?.[0]?.children?.[0]?.text) {
    return "Join us for this exciting fitness class.";
  }
  return description.document[0].children[0].text;
}

// Function to map difficulty to category label
function getDifficultyLabel(difficulty: string): string {
  const labels: Record<string, string> = {
    'beginner': 'Beginner',
    'intermediate': 'Intermediate',
    'advanced': 'Advanced',
    'all-levels': 'All Levels',
  };
  return labels[difficulty] || 'All Levels';
}

// Function to get difficulty color
function getDifficultyColor(difficulty: string): string {
  const colors: Record<string, string> = {
    'beginner': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'intermediate': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    'advanced': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'all-levels': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };
  return colors[difficulty] || 'bg-primary/10 text-primary';
}

export default async function ClassGrid() {
  const classTypes = await getClassTypes();

  // If no class types in database, show placeholder message
  if (classTypes.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <p className="text-muted-foreground">
          No classes available at the moment. Check back soon!
        </p>
      </div>
    );
  }

  const classes = classTypes.map((classType: ClassTypeData) => ({
    id: classType.id,
    name: classType.name,
    difficulty: classType.difficulty,
    category: getDifficultyLabel(classType.difficulty),
    duration: classType.duration,
    description: getDescriptionText(classType.description),
    caloriesBurn: classType.caloriesBurn || 0,
    equipmentNeeded: classType.equipmentNeeded || [],
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {classes.map((gymClass) => (
        <div
          key={gymClass.id}
          className="group bg-card border rounded-xl overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1"
        >
          {/* Class header with gradient */}
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-6 pb-4">
            <div className="flex justify-between items-start mb-3">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getDifficultyColor(gymClass.difficulty)}`}>
                {gymClass.category}
              </span>
              {gymClass.caloriesBurn > 0 && (
                <div className="flex items-center gap-1 text-sm font-bold">
                  <Flame className="w-4 h-4 text-orange-500" />
                  {gymClass.caloriesBurn}
                </div>
              )}
            </div>
            <h3 className="font-bold text-xl mb-2 group-hover:text-primary transition-colors">
              {gymClass.name}
            </h3>
          </div>

          {/* Class content */}
          <div className="p-6 pt-4">
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {gymClass.description}
            </p>

            {/* Meta info */}
            <div className="flex items-center gap-4 mb-4 pb-4 border-b">
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="w-4 h-4 text-primary" />
                <span>{gymClass.duration} min</span>
              </div>
              {gymClass.equipmentNeeded && gymClass.equipmentNeeded.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Dumbbell className="w-4 h-4 text-primary" />
                  <span className="text-muted-foreground text-xs">
                    {gymClass.equipmentNeeded.length} items
                  </span>
                </div>
              )}
            </div>

            {/* Action button */}
            <Link
              href={`/schedule`}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center justify-center transition-colors"
            >
              View Schedule
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
