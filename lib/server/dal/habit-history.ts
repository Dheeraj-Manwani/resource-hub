import "server-only"
import {
  analyseHabitHistory,
  historyBounds,
  type HistoryView,
} from "@/lib/habits/history"
import { listHabits } from "./habits"
import { badRequest, notFound } from "@/lib/server/api"

export async function habitHistory(
  userId: string,
  date: string | undefined,
  view: HistoryView,
  habitId?: string
) {
  const bundle = await listHabits(userId, "1900-01-01", "2200-12-31")
  const anchor = date ?? bundle.today,
    bounds = historyBounds(anchor, view, bundle.weekStart)
  if (anchor > bundle.today)
    throw badRequest("Browse history through today; future dates are plans")
  const items = habitId
    ? bundle.items.filter((h) => h.id === habitId)
    : bundle.items
  if (habitId && !items.length) throw notFound("Habit")
  return {
    ...bounds,
    date: anchor,
    today: bundle.today,
    timezone: bundle.timezone,
    weekStart: bundle.weekStart,
    items: items.map((habit) =>
      analyseHabitHistory(
        habit,
        bounds.from,
        bounds.to,
        bundle.today,
        bundle.weekStart
      )
    ),
  }
}
