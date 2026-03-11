"use client"

import Link from "next/link"

// Mock schedule data - in production, this would fetch from GraphQL API
const getScheduleForClass = (classId: string) => {
  return [
    { id: "s1", date: "Tomorrow", time: "7:00 AM", spots: 5 },
    { id: "s2", date: "Wednesday", time: "7:00 AM", spots: 8 },
    { id: "s3", date: "Friday", time: "7:00 AM", spots: 3 },
    { id: "s4", date: "Saturday", time: "9:00 AM", spots: 12 },
    { id: "s5", date: "Sunday", time: "10:00 AM", spots: 15 },
  ]
}

export default function ClassScheduleList({ classId }: { classId: string }) {
  const sessions = getScheduleForClass(classId)

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <div>
            <div className="font-medium">{session.date}</div>
            <div className="text-sm text-muted-foreground">{session.time}</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {session.spots} spots
            </span>
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                session.spots > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
              disabled={session.spots === 0}
            >
              {session.spots > 0 ? "Book" : "Full"}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
