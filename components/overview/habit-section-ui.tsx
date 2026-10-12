"use client"

import type { OverviewHabit } from "@/lib/overview/habit-sections"
import { habitColors } from "@/lib/habits/appearance"

export function habitDateLabel(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`))
}
export function habitWorkLabel(minutes: number) {
  const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 })
  return minutes > 0 && minutes < 1
    ? `${Math.round(minutes * 60)} sec`
    : minutes >= 60
      ? `${number.format(minutes / 60)} hr`
      : `${number.format(minutes)} min`
}
export function HabitName({
  habit,
  onOpen,
}: {
  habit: OverviewHabit
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 min-w-0 items-center gap-2 text-left text-sm font-medium break-words hover:text-brand"
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-raised"
        style={{ color: habitColors[habit.color] }}
      >
        {habit.icon}
      </span>
      <span className="min-w-0">
        {habit.name}
        {habit.status !== "active" && (
          <span className="ml-2 text-xs font-normal text-subtle">
            {habit.status === "paused" ? "Paused" : "Archived"}
          </span>
        )}
      </span>
    </button>
  )
}
