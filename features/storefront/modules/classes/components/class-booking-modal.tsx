"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Clock, Users, Calendar, Flame, User, X } from "lucide-react"
import { toast } from "sonner"

type ClassBookingModalProps = {
  isOpen: boolean
  onClose: () => void
  classData: {
    id: string
    name: string
    instructor: string
    time: string
    duration: number
    spots: number
    capacity: number
    difficulty?: string
    date?: string
  }
  onBookingSuccess?: () => void
}

export default function ClassBookingModal({
  isOpen,
  onClose,
  classData,
  onBookingSuccess
}: ClassBookingModalProps) {
  const [isBooking, setIsBooking] = useState(false)
  const router = useRouter()

  const handleBookClass = async () => {
    setIsBooking(true)

    try {
      // TODO: Get authenticated user ID
      const userId = "temp-user-id" // This will be replaced with actual auth

      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            mutation BookClass($classInstanceId: ID!, $memberId: ID!) {
              bookClass(classInstanceId: $classInstanceId, memberId: $memberId) {
                booking {
                  id
                  status
                  waitlistPosition
                }
                creditsRemaining
              }
            }
          `,
          variables: {
            classInstanceId: classData.id,
            memberId: userId,
          },
        }),
      })

      const result = await response.json()

      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      const { booking, creditsRemaining } = result.data.bookClass

      if (booking.status === "waitlist") {
        toast.success(`Added to waitlist at position ${booking.waitlistPosition}`, {
          description: "We'll notify you if a spot opens up.",
        })
      } else {
        toast.success("Class booked successfully!", {
          description: `You have ${creditsRemaining === -1 ? 'unlimited' : creditsRemaining} credits remaining.`,
        })
      }

      onBookingSuccess?.()
      onClose()
      router.refresh()
    } catch (error: any) {
      console.error("Booking error:", error)

      if (error.message.includes("No active membership")) {
        toast.error("No active membership found", {
          description: "Please purchase a membership to book classes.",
          action: {
            label: "View Memberships",
            onClick: () => router.push("/memberships"),
          },
        })
      } else if (error.message.includes("No class credits")) {
        toast.error("No class credits remaining", {
          description: "Please upgrade your membership or purchase a class pack.",
          action: {
            label: "View Memberships",
            onClick: () => router.push("/memberships"),
          },
        })
      } else {
        toast.error("Failed to book class", {
          description: error.message || "Please try again later.",
        })
      }
    } finally {
      setIsBooking(false)
    }
  }

  const isFull = classData.spots === 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{classData.name}</DialogTitle>
          <DialogDescription>
            Review class details and confirm your booking
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Class details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Instructor:</span>
              <span className="font-semibold">{classData.instructor}</span>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Date:</span>
              <span className="font-semibold">
                {classData.date || new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Time:</span>
              <span className="font-semibold">{classData.time}</span>
              <span className="text-muted-foreground">({classData.duration} min)</span>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Availability:</span>
              <span className={`font-semibold ${
                classData.spots > 5 ? 'text-green-600' :
                classData.spots > 0 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {classData.spots} / {classData.capacity} spots
              </span>
            </div>

            {classData.difficulty && (
              <div className="flex items-center gap-3 text-sm">
                <Flame className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Level:</span>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                  {classData.difficulty}
                </span>
              </div>
            )}
          </div>

          {/* Warning for full classes */}
          {isFull && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                This class is currently full. You'll be added to the waitlist and notified if a spot opens up.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
            disabled={isBooking}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBookClass}
            className="flex-1"
            disabled={isBooking}
          >
            {isBooking ? (
              "Booking..."
            ) : isFull ? (
              "Join Waitlist"
            ) : (
              "Confirm Booking"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
