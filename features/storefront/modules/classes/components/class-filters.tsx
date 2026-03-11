"use client"

import { useState } from "react"

const categories = [
  { id: "all", name: "All Classes" },
  { id: "yoga", name: "Yoga" },
  { id: "cardio", name: "Cardio" },
  { id: "strength", name: "Strength" },
  { id: "hiit", name: "HIIT" },
  { id: "combat", name: "Combat" },
  { id: "pilates", name: "Pilates" },
]

const durations = [
  { id: "all", name: "Any Duration" },
  { id: "30", name: "30 min" },
  { id: "45", name: "45 min" },
  { id: "60", name: "60 min" },
  { id: "75", name: "75+ min" },
]

export default function ClassFilters() {
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedDuration, setSelectedDuration] = useState("all")

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">Category</h3>
        <div className="space-y-2">
          {categories.map((category) => (
            <label
              key={category.id}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="category"
                value={category.id}
                checked={selectedCategory === category.id}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-primary focus:ring-primary"
              />
              <span className="text-sm">{category.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-3">Duration</h3>
        <div className="space-y-2">
          {durations.map((duration) => (
            <label
              key={duration.id}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name="duration"
                value={duration.id}
                checked={selectedDuration === duration.id}
                onChange={(e) => setSelectedDuration(e.target.value)}
                className="text-primary focus:ring-primary"
              />
              <span className="text-sm">{duration.name}</span>
            </label>
          ))}
        </div>
      </div>
      <button
        className="w-full border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2 rounded-md text-sm font-medium"
        onClick={() => {
          setSelectedCategory("all")
          setSelectedDuration("all")
        }}
      >
        Reset Filters
      </button>
    </div>
  )
}
