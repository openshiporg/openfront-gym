"use server"

import { keystoneContext } from "@/features/keystone/context"

export type CalendarEvent = {
  id: string
  title: string
  start: string
  end: string
  instructor: string
  capacity: string
  type: string
  color: string
}

export async function getCalendarEvents(start: Date, end: Date, userId?: string) {
  const context = keystoneContext.sudo()

  try {
    const where: any = {
      date: {
        gte: start.toISOString(),
        lte: end.toISOString(),
      },
    }

    // If userId is provided (instructor mode), filter instances they are assigned to
    if (userId) {
      where.instructor = { user: { id: { equals: userId } } }
    }

    const instances = await context.query.ClassInstance.findMany({
      where,
      query: `
        id
        date
        isCancelled
        classSchedule {
          name
          startTime
          endTime
          maxCapacity
          instructor {
            user {
              name
            }
          }
        }
        instructor {
          user {
            name
          }
        }
        bookingsCount
      `,
    })

    return {
      success: true,
      data: instances.map((inst: any) => {
        const schedule = inst.classSchedule || {}
        const instructorName = inst.instructor?.user?.name || schedule.instructor?.user?.name || "TBA"
        
        // Calculate end time based on start time + duration (mocking 1hr if not available)
        // In a real app, ClassInstance or Schedule would have duration/endTime fields
        const startDate = new Date(inst.date)
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)

        return {
          id: inst.id,
          title: schedule.name || "Untitled Class",
          start: inst.date,
          end: endDate.toISOString(),
          instructor: instructorName,
          capacity: `${inst.bookingsCount || 0}/${schedule.maxCapacity || 0}`,
          type: schedule.name?.toLowerCase().includes("yoga") ? "yoga" : "hiit",
          isCancelled: inst.isCancelled
        }
      }),
    }
  } catch (error) {
    console.error("Failed to fetch calendar events:", error)
    return { success: false, data: [] }
  }
}
