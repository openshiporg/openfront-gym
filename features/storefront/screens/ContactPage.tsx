import { Metadata } from "next"
import { MapPin, Phone, Mail, Clock } from "lucide-react"

export const metadata: Metadata = {
  title: "Contact Us - Openfront Gym",
  description: "Get in touch with Openfront Gym. Visit us, call us, or send us a message.",
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Contact Us - Openfront Gym",
    description: "Get in touch with Openfront Gym. Visit us, call us, or send us a message.",
  }
}

const contactInfo = [
  {
    icon: MapPin,
    title: "Location",
    details: ["123 Fitness Avenue", "San Francisco, CA 94102"],
  },
  {
    icon: Phone,
    title: "Phone",
    details: ["(415) 555-0123", "Mon-Fri: 6am - 10pm"],
  },
  {
    icon: Mail,
    title: "Email",
    details: ["info@openfrontgym.com", "support@openfrontgym.com"],
  },
]

const hours = [
  { day: "Monday - Friday", hours: "5:00 AM - 11:00 PM" },
  { day: "Saturday", hours: "6:00 AM - 10:00 PM" },
  { day: "Sunday", hours: "7:00 AM - 9:00 PM" },
  { day: "Holidays", hours: "8:00 AM - 6:00 PM" },
]

export async function ContactPage() {
  return (
    <div className="container py-8 md:py-12">
      {/* Hero Section */}
      <div className="mb-12 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
        <p className="text-lg text-muted-foreground">
          We're here to help you on your fitness journey. Reach out with any questions or schedule a visit.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left Column - Contact Info & Hours */}
        <div className="space-y-8">
          {/* Contact Information */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Get in Touch</h2>
            <div className="space-y-6">
              {contactInfo.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="flex gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{item.title}</h3>
                      {item.details.map((detail) => (
                        <p key={detail} className="text-muted-foreground text-sm">
                          {detail}
                        </p>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hours */}
          <div className="bg-card border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">Hours of Operation</h2>
            </div>
            <div className="space-y-3">
              {hours.map((schedule) => (
                <div key={schedule.day} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="font-medium">{schedule.day}</span>
                  <span className="text-muted-foreground">{schedule.hours}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              * Premium members have 24/7 access via key card
            </p>
          </div>

          {/* Map Embed */}
          <div className="bg-muted rounded-lg h-64 overflow-hidden border">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3153.0194344434437!2d-122.41941548468143!3d37.77492997975903!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8085809c6c8f4459%3A0xb10ed6d9b5050fa5!2sUnion%20Square%2C%20San%20Francisco%2C%20CA!5e0!3m2!1sen!2sus!4v1234567890123"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Openfront Gym Location"
            />
          </div>

          {/* Parking Information */}
          <div className="bg-card border rounded-lg p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Parking Information
            </h3>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                • Free parking for members in our underground garage
              </p>
              <p className="text-muted-foreground">
                • 2-hour validation for guests at front desk
              </p>
              <p className="text-muted-foreground">
                • Bike racks available at main entrance
              </p>
              <p className="text-muted-foreground">
                • Accessible parking spaces near entrance
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Contact Form */}
        <div>
          <div className="bg-card border rounded-lg p-8">
            <h2 className="text-2xl font-bold mb-6">Send Us a Message</h2>
            <form className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    required
                    className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    required
                    className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium mb-2">
                  Subject *
                </label>
                <select
                  id="subject"
                  name="subject"
                  required
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Select a subject</option>
                  <option value="membership">Membership Inquiry</option>
                  <option value="classes">Class Information</option>
                  <option value="personal-training">Personal Training</option>
                  <option value="facility-tour">Schedule a Tour</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium mb-2">
                  Message *
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  required
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-md font-semibold transition-colors"
              >
                Send Message
              </button>
            </form>
          </div>

          {/* Quick Links */}
          <div className="mt-8 bg-muted/50 rounded-lg p-6">
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <div className="space-y-2">
              <a href="/memberships" className="block text-sm text-primary hover:underline">
                View Membership Plans
              </a>
              <a href="/classes" className="block text-sm text-primary hover:underline">
                Browse Class Schedule
              </a>
              <a href="/facilities" className="block text-sm text-primary hover:underline">
                Explore Our Facilities
              </a>
              <a href="/instructors" className="block text-sm text-primary hover:underline">
                Meet Our Instructors
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
