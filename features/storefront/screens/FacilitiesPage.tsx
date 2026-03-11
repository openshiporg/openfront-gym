import { Metadata } from "next"
import { Dumbbell, Users, Wifi, Droplet, Clock, MapPin } from "lucide-react"

export const metadata: Metadata = {
  title: "Facilities - Openfront Gym",
  description: "Explore our state-of-the-art facilities and amenities designed for your fitness journey.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Facilities - Openfront Gym",
    description: "Explore our state-of-the-art facilities and amenities designed for your fitness journey.",
  }
}

const facilities = [
  {
    icon: Dumbbell,
    title: "Weight Training Area",
    description: "Premium free weights, power racks, and Olympic platforms for serious strength training.",
    features: ["Dumbbells 5-150 lbs", "Olympic Platforms", "Power Racks", "Cable Machines"],
  },
  {
    icon: Users,
    title: "Group Fitness Studios",
    description: "Spacious studios with top-quality equipment for our diverse class offerings.",
    features: ["Yoga Studio", "Spin Studio", "HIIT Arena", "Dance Studio"],
  },
  {
    icon: Clock,
    title: "Cardio Zone",
    description: "Latest cardio equipment with entertainment systems to make your workout fly by.",
    features: ["Treadmills", "Ellipticals", "Rowing Machines", "Bikes"],
  },
  {
    icon: Droplet,
    title: "Locker Rooms",
    description: "Clean, modern facilities with premium amenities for your comfort.",
    features: ["Showers", "Sauna", "Steam Room", "Day Lockers"],
  },
  {
    icon: Wifi,
    title: "Member Lounge",
    description: "Relax and socialize in our comfortable lounge area with complimentary WiFi.",
    features: ["Free WiFi", "Smoothie Bar", "Relaxation Area", "TV Screens"],
  },
  {
    icon: MapPin,
    title: "Personal Training Area",
    description: "Dedicated space for one-on-one training sessions with our expert trainers.",
    features: ["Private Rooms", "Assessment Tools", "Specialized Equipment", "Progress Tracking"],
  },
]

const amenities = [
  "24/7 Access for Premium Members",
  "Towel Service",
  "Member Parking",
  "Pro Shop",
  "Child Care Services",
  "Physical Therapy",
  "Nutrition Counseling",
  "Group Training Programs",
]

export async function FacilitiesPage() {
  return (
    <div className="container py-8 md:py-12">
      {/* Hero Section */}
      <div className="mb-12 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Our Facilities</h1>
        <p className="text-lg text-muted-foreground">
          Experience fitness in a state-of-the-art environment designed to help you achieve your goals.
          From cutting-edge equipment to luxurious amenities, we have everything you need.
        </p>
      </div>

      {/* Facilities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        {facilities.map((facility) => {
          const Icon = facility.icon
          return (
            <div
              key={facility.title}
              className="bg-card border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Photo Gallery Placeholder */}
              <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon className="w-16 h-16 text-primary/30" />
                </div>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-semibold">{facility.title}</h3>
                    {/* Occupancy indicator for applicable facilities */}
                    {["Weight Training Area", "Cardio Zone"].includes(facility.title) && (
                      <span className="text-xs px-2.5 py-1 bg-green-500/10 text-green-600 rounded-full font-medium">
                        Low Activity
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">{facility.description}</p>
                </div>
                <div className="space-y-2">
                  {facility.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Amenities Section */}
      <div className="bg-muted/50 rounded-lg p-8 mb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">Additional Amenities</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {amenities.map((amenity) => (
            <div key={amenity} className="flex items-start gap-2">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
              <span className="text-sm">{amenity}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance Schedule */}
      <div className="bg-card border rounded-lg p-8 mb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">Facility Maintenance Schedule</h2>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Pool & Spa</p>
              <p className="text-sm text-muted-foreground">Deep cleaning and water treatment</p>
            </div>
            <span className="text-sm text-muted-foreground">Every Sunday 6-8 AM</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Cardio Equipment</p>
              <p className="text-sm text-muted-foreground">Calibration and inspection</p>
            </div>
            <span className="text-sm text-muted-foreground">1st Mon of Month 5-7 AM</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <p className="font-medium">Group Studios</p>
              <p className="text-sm text-muted-foreground">Deep cleaning and floor maintenance</p>
            </div>
            <span className="text-sm text-muted-foreground">Daily 11 PM - 5 AM</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Locker Rooms</p>
              <p className="text-sm text-muted-foreground">Sanitization and restocking</p>
            </div>
            <span className="text-sm text-muted-foreground">Every 2 hours</span>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="mt-16 text-center bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-12">
        <h2 className="text-3xl font-bold mb-4">Ready to Experience Our Facilities?</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
          Schedule a tour or start your membership today to access all our world-class facilities and amenities.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/contact"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-md font-semibold inline-flex items-center justify-center transition-colors"
          >
            Schedule a Tour
          </a>
          <a
            href="/memberships"
            className="border-2 border-primary/20 bg-background hover:bg-primary/5 px-8 py-3 rounded-md font-semibold inline-flex items-center justify-center transition-colors"
          >
            View Memberships
          </a>
        </div>
      </div>
    </div>
  )
}
