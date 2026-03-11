"use client"

import { useState, useEffect, useRef } from "react"
import { Search, X } from "lucide-react"
import Link from "next/link"

// Mock class data - in production this would come from GraphQL
const mockClasses = [
  { id: "1", name: "Morning Yoga", instructor: "Sarah Johnson", time: "7:00 AM" },
  { id: "2", name: "HIIT Training", instructor: "Mike Chen", time: "8:00 AM" },
  { id: "3", name: "Spin Class", instructor: "Emma Davis", time: "9:00 AM" },
  { id: "4", name: "Strength Training", instructor: "John Smith", time: "10:00 AM" },
  { id: "5", name: "Pilates", instructor: "Lisa Brown", time: "11:00 AM" },
  { id: "6", name: "Boxing", instructor: "Tom Wilson", time: "12:00 PM" },
  { id: "7", name: "Zumba", instructor: "Maria Garcia", time: "1:00 PM" },
  { id: "8", name: "CrossFit", instructor: "David Lee", time: "2:00 PM" },
]

export default function ClassSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<typeof mockClasses>([])
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim()) {
      const filtered = mockClasses.filter(
        (cls) =>
          cls.name.toLowerCase().includes(query.toLowerCase()) ||
          cls.instructor.toLowerCase().includes(query.toLowerCase())
      )
      setResults(filtered)
    } else {
      setResults([])
    }
  }, [query])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleClear = () => {
    setQuery("")
    setResults([])
  }

  return (
    <div ref={searchRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-muted rounded-md transition-colors"
        aria-label="Search classes"
      >
        <Search className="w-5 h-5 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border rounded-lg shadow-lg z-50">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search classes or instructors..."
                className="w-full pl-10 pr-10 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                autoFocus
              />
              {query && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {query && results.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No classes found
              </div>
            ) : results.length > 0 ? (
              <div className="py-2">
                {results.map((cls) => (
                  <Link
                    key={cls.id}
                    href={`/classes/${cls.id}`}
                    className="block px-4 py-3 hover:bg-muted transition-colors"
                    onClick={() => {
                      setIsOpen(false)
                      setQuery("")
                    }}
                  >
                    <div className="font-medium text-sm">{cls.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {cls.instructor} • {cls.time}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <div className="text-sm font-medium mb-2">Quick Links</div>
                <Link
                  href="/classes"
                  className="block text-sm text-primary hover:underline"
                  onClick={() => setIsOpen(false)}
                >
                  Browse All Classes
                </Link>
                <Link
                  href="/schedule"
                  className="block text-sm text-primary hover:underline"
                  onClick={() => setIsOpen(false)}
                >
                  View Schedule
                </Link>
                <Link
                  href="/instructors"
                  className="block text-sm text-primary hover:underline"
                  onClick={() => setIsOpen(false)}
                >
                  Meet Instructors
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
