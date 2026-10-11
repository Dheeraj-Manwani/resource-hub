import "server-only"
import { habitJourney, summariseHabitWork } from "@/lib/habits/motivation"
import { addDays, weekDates } from "@/lib/habits/model"
import { listHabits } from "./habits"
import { getHabitPreferences } from "./habit-rewards"
export async function habitMotivation(userId: string) {
  const [bundle, preferences] = await Promise.all([
    listHabits(userId, "1900-01-01", "2200-12-31"),
    getHabitPreferences(userId),
  ])
  const week = weekDates(bundle.today, bundle.weekStart),
    previous = weekDates(addDays(week[0], -1), bundle.weekStart)
  return {
    today: bundle.today,
    weekStart: bundle.weekStart,
    preferences,
    items: bundle.items.map((h) =>
      habitJourney(h, bundle.today, bundle.weekStart)
    ),
    recaps: {
      today: summariseHabitWork(bundle.items, bundle.today, bundle.today),
      week: summariseHabitWork(bundle.items, week[0], bundle.today),
      previousWeek: summariseHabitWork(bundle.items, previous[0], previous[6]),
    },
  }
}
