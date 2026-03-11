"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Calendar, Clock, User, X, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type BookingData = {
  id: string
  classInstance: {
    id: string
    date: string
    classSchedule: {
      name: string
      startTime: string
      endTime: string
    }
    instructor: {
      user: {
        name: string
      }
    } | null
  }
  status: string
  waitlistPosition: number | null
  bookedAt: string
  cancelledAt: string | null
}

type BookingsListProps = {
  upcomingBookings: BookingData[]
  bookingHistory: BookingData[]
}

export default function BookingsList({ upcomingBookings, bookingHistory }: BookingsListProps) {
  const router = useRouter()
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const handleCancelClick = (bookingId: string) => {
    setCancellingBookingId(bookingId)
    setShowCancelDialog(true)
  }

  const handleCancelBooking = async () => {
    if (!cancellingBookingId) return

    try {
      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            mutation UpdateClassBooking($id: ID!, $data: ClassBookingUpdateInput!) {
              updateClassBooking(where: { id: $id }, data: $data) {
                id
                status
              }
            }
          `,
          variables: {
            id: cancellingBookingId,
            data: {
              status: "cancelled",
              cancelledAt: new Date().toISOString(),
            },
          },
        }),
      })

      const result = await response.json()

      if (result.errors) {
        throw new Error(result.errors[0].message)
      }

      toast.success("Booking cancelled successfully", {
        description: "Your class credit has been refunded.",
      })

      router.refresh()
    } catch (error: any) {
      console.error("Error cancelling booking:", error)
      toast.error("Failed to cancel booking", {
        description: error.message || "Please try again later.",
      })
    } finally {
      setShowCancelDialog(false)
      setCancellingBookingId(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow"
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    }
  }

  const getStatusBadge = (status: string, waitlistPosition: number | null) => {
    if (status === "confirmed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-semibold rounded-full">
          <CheckCircle className="w-3 h-3" />
          Confirmed
        </span>
      )
    } else if (status === "waitlist") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs font-semibold rounded-full">
          <AlertCircle className="w-3 h-3" />
          Waitlist #{waitlistPosition}
        </span>
      )
    } else if (status === "cancelled") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 text-xs font-semibold rounded-full">
          <X className="w-3 h-3" />
          Cancelled
        </span>
      )
    }
    return null
  }

  return (
    <>
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Upcoming Bookings</h3>
            {upcomingBookings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No upcoming bookings.</p>
                <Button asChild>
                  <a href="/schedule">Book a Class</a>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{booking.classInstance.classSchedule.name}</h4>
                        {getStatusBadge(booking.status, booking.waitlistPosition)}
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {booking.classInstance.instructor && (
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3" />
                            with {booking.classInstance.instructor.user.name}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3" />
                          {formatDate(booking.classInstance.date)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {booking.classInstance.classSchedule.startTime}
                        </div>
                      </div>
                    </div>
                    {booking.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelClick(booking.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Cancel Booking
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Booking History</h3>
            {bookingHistory.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No booking history.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookingHistory.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg opacity-75"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{booking.classInstance.classSchedule.name}</h4>
                        {getStatusBadge(booking.status, booking.waitlistPosition)}
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {booking.classInstance.instructor && (
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3" />
                            with {booking.classInstance.instructor.user.name}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3" />
                          {formatDate(booking.classInstance.date)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {booking.classInstance.classSchedule.startTime}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this booking? Your class credit will be refunded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelBooking}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancel Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
