"use client"

import { useState } from "react"
import Link from "next/link"
import { Clock, Users, MapPin } from "lucide-react"
import ClassBookingModal from "./class-booking-modal"

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const fullDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

type ScheduleItem = {
  day: number;
  time: string;
  name: string;
  instructor: string;
  duration: number;
  spots: number;
  capacity: number;
  id: string;
  difficulty?: string;
  room?: string;
}

type WeeklyScheduleProps = {
  scheduleData?: ScheduleItem[];
}

export default function WeeklySchedule({ scheduleData = [] }: WeeklyScheduleProps) {
  const today = new Date().getDay()
  const [selectedDay, setSelectedDay] = useState(today)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState<ScheduleItem | null>(null)

  const dayClasses = scheduleData
    .filter((c) => c.day === selectedDay)
    .sort((a, b) => a.time.localeCompare(b.time))

  const getStatusColor = (spots: number, capacity: number) => {
    const percentage = (spots / capacity) * 100
    if (percentage > 50) return 'text-green-600'
    if (percentage > 20) return 'text-yellow-600'
    return 'text-red-600'
  }

  const handleBookClass = (gymClass: ScheduleItem) => {
    setSelectedClass(gymClass)
    setBookingModalOpen(true)
  }

  const handleBookingSuccess = () => {
    // Refresh the schedule data
    // This will be handled by the router.refresh() in the modal
  }

  return (
    <div>
      {/* Day selector */}
      <div className="mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {weekDays.map((day, index) => {
            const isToday = index === today
            const isSelected = selectedDay === index
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(index)}
                className={`relative px-6 py-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {day}
                {isToday && !isSelected && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day heading */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">{fullDays[selectedDay]}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {dayClasses.length} {dayClasses.length === 1 ? 'class' : 'classes'} scheduled
          </p>
        </div>
      </div>

      {/* Class list */}
      {dayClasses.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg">
          <p className="text-muted-foreground">No classes scheduled for this day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayClasses.map((gymClass) => (
            <div
              key={`${gymClass.id}-${gymClass.time}`}
              className="group bg-card border rounded-lg p-5 hover:shadow-md transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  {/* Time */}
                  <div className="text-center min-w-[80px]">
                    <div className="text-xl font-bold">{gymClass.time}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {gymClass.duration} min
                    </div>
                  </div>

                  {/* Class info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg">{gymClass.name}</h3>
                      {gymClass.difficulty && (
                        <span className="text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                          {gymClass.difficulty}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      with {gymClass.instructor}
                    </p>
                    {gymClass.room && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {gymClass.room}
                      </div>
                    )}
                  </div>
                </div>

                {/* Availability and action */}
                <div className="flex items-center gap-4 md:flex-row-reverse">
                  <button
                    onClick={() => handleBookClass(gymClass)}
                    className={`px-6 py-2.5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
                      gymClass.spots >= 0
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    }`}
                  >
                    {gymClass.spots > 0 ? "Book Class" : "Join Waitlist"}
                  </button>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${getStatusColor(gymClass.spots, gymClass.capacity)}`}>
                      <Users className="w-4 h-4 inline mr-1" />
                      {gymClass.spots} spots left
                    </div>
                    <div className="text-xs text-muted-foreground">
                      of {gymClass.capacity}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Booking Modal */}
      {selectedClass && (
        <ClassBookingModal
          isOpen={bookingModalOpen}
          onClose={() => setBookingModalOpen(false)}
          classData={{
            id: selectedClass.id,
            name: selectedClass.name,
            instructor: selectedClass.instructor,
            time: selectedClass.time,
            duration: selectedClass.duration,
            spots: selectedClass.spots,
            capacity: selectedClass.capacity,
            difficulty: selectedClass.difficulty,
            date: fullDays[selectedDay],
          }}
          onBookingSuccess={handleBookingSuccess}
        />
      )}
    </div>
  )
}
