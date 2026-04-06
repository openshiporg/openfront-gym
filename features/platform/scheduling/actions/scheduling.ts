"use server"

import { revalidatePath } from "next/cache"
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
  isCancelled?: boolean
  rosterHref?: string
  scheduleId?: string
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

    if (userId) {
      where.OR = [
        { instructor: { user: { id: { equals: userId } } } },
        { classSchedule: { instructor: { user: { id: { equals: userId } } } } },
      ]
    }

    const instances = await context.query.ClassInstance.findMany({
      where,
      query: `
        id
        date
        isCancelled
        maxCapacity
        classSchedule {
          id
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
        const startDate = new Date(inst.date)
        const endDate = schedule.endTime
          ? (() => {
              const [h, m] = String(schedule.endTime).split(":").map(Number)
              const d = new Date(inst.date)
              d.setHours(h, m, 0, 0)
              return d
            })()
          : new Date(startDate.getTime() + 60 * 60 * 1000)

        return {
          id: inst.id,
          title: schedule.name || "Untitled Class",
          start: inst.date,
          end: endDate.toISOString(),
          instructor: instructorName,
          capacity: `${inst.bookingsCount || 0}/${inst.maxCapacity || schedule.maxCapacity || 0}`,
          type: schedule.name?.toLowerCase().includes("yoga") ? "yoga" : "class",
          color: inst.isCancelled ? "zinc" : "violet",
          isCancelled: inst.isCancelled,
          rosterHref: `/dashboard/platform/rosters/${inst.id}`,
          scheduleId: schedule.id,
        }
      }),
    }
  } catch (error) {
    console.error("Failed to fetch calendar events:", error)
    return { success: false, data: [] }
  }
}

export async function getSchedulingWorkspaceData(
  start: Date,
  end: Date,
  options?: { userId?: string; isInstructorOnly?: boolean }
) {
  const context = keystoneContext.sudo()
  const isInstructorOnly = Boolean(options?.isInstructorOnly && options?.userId)

  const schedulesWhere = isInstructorOnly
    ? { instructor: { user: { id: { equals: options?.userId } } } }
    : {}

  const instructorsWhere = isInstructorOnly
    ? { isActive: { equals: true }, user: { id: { equals: options?.userId } } }
    : { isActive: { equals: true } }

  const upcomingInstancesWhere = isInstructorOnly
    ? {
        date: { gte: new Date().toISOString() },
        OR: [
          { instructor: { user: { id: { equals: options?.userId } } } },
          { classSchedule: { instructor: { user: { id: { equals: options?.userId } } } } },
        ],
      }
    : {
        date: { gte: new Date().toISOString() },
      }

  const [eventsResponse, schedules, instructors, upcomingInstances] = await Promise.all([
    getCalendarEvents(start, end, isInstructorOnly ? options?.userId : undefined),
    context.query.ClassSchedule.findMany({
      where: schedulesWhere,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      query: `
        id
        name
        description
        dayOfWeek
        startTime
        endTime
        maxCapacity
        isActive
        instructor {
          id
          user { id name email }
        }
      `,
    }),
    context.query.Instructor.findMany({
      where: instructorsWhere,
      query: `
        id
        user { id name email }
      `,
    }),
    context.query.ClassInstance.findMany({
      where: upcomingInstancesWhere,
      orderBy: [{ date: "asc" }],
      take: 30,
      query: `
        id
        date
        isCancelled
        cancellationReason
        bookingsCount
        maxCapacity
        classSchedule {
          id
          name
          dayOfWeek
          startTime
          endTime
          maxCapacity
        }
        instructor {
          id
          user { name }
        }
      `,
    }),
  ])

  return {
    events: eventsResponse.success ? eventsResponse.data : [],
    schedules: schedules as any[],
    instructors: instructors as any[],
    upcomingInstances: upcomingInstances as any[],
  }
}

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

export async function generateUpcomingInstances(weeks: number = 4) {
  const context = keystoneContext.sudo()
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const schedules = await context.query.ClassSchedule.findMany({
    where: { isActive: { equals: true } },
    query: `
      id
      dayOfWeek
      startTime
      maxCapacity
      instructor { id }
    `,
  })

  let createdCount = 0

  for (const schedule of schedules as any[]) {
    const targetDow = DAY_MAP[schedule.dayOfWeek]
    if (targetDow === undefined) continue

    for (let offset = 0; offset <= weeks * 7; offset++) {
      const date = new Date(now)
      date.setDate(now.getDate() + offset)
      if (date.getDay() !== targetDow) continue

      const [h, m] = String(schedule.startTime || '07:00').split(':').map(Number)
      date.setHours(h, m, 0, 0)
      const iso = date.toISOString()

      const existing = await context.query.ClassInstance.count({
        where: {
          classSchedule: { id: { equals: schedule.id } },
          date: { equals: iso },
        },
      })

      if (existing > 0) continue

      await context.query.ClassInstance.createOne({
        data: {
          classSchedule: { connect: { id: schedule.id } },
          date: iso,
          maxCapacity: schedule.maxCapacity,
          isCancelled: false,
          ...(schedule.instructor?.id ? { instructor: { connect: { id: schedule.instructor.id } } } : {}),
        },
        query: 'id',
      })

      createdCount += 1
    }
  }

  revalidatePath('/dashboard/platform/scheduling')
  return { success: true, createdCount }
}
