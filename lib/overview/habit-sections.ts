import { analyseHabitHistory, type HistoryDay } from "@/lib/habits/history"
import {
  versionOn,
  weekDates,
  type Habit,
  type HabitBundle,
} from "@/lib/habits/model"

export const HABIT_OVERVIEW_SECTION_IDS = [
  "habit-streaks",
  "weekly-habit-progress",
  "recent-habit-activity",
] as const
export type OverviewHabit = Pick<
  Habit,
  "id" | "name" | "icon" | "color" | "status"
>
export type HabitStreaksData = {
  today: string
  total: number
  items: (OverviewHabit & {
    current: number
    best: number
    period: "day" | "week" | "month"
  })[]
}
export type WeeklyHabitProgressData = {
  today: string
  timezone: string
  from: string
  to: string
  total: number
  items: (OverviewHabit & {
    completed: number
    eligible: number
    minutes: number
    days: HistoryDay[]
  })[]
}
export type RecentHabitActivityData = {
  today: string
  timezone: string
  items: {
    id: string
    habit: OverviewHabit
    date: string
    kind: "progress" | "skip" | "session"
    source: "manual" | "timer"
    amount: number
    unit: string
    minutes: number
    notes: string
    updatedAt: string
  }[]
}
export function overviewHabit(habit: OverviewHabit): OverviewHabit {
  return {
    id: habit.id,
    name: habit.name,
    icon: habit.icon,
    color: habit.color,
    status: habit.status,
  }
}

/** Streaks count goal periods, including flexible weeks, rather than calendar days. */
export function habitStreaks(bundle: HabitBundle): HabitStreaksData {
  const items = bundle.items
    .filter(
      (habit) => habit.status === "active" && versionOn(habit, bundle.today)
    )
    .map((habit) => {
      const history = analyseHabitHistory(
        habit,
        bundle.today,
        bundle.today,
        bundle.today,
        bundle.weekStart
      )
      const config = versionOn(habit, bundle.today)!.config
      return {
        ...overviewHabit(habit),
        current: history.summary.currentStreak,
        best: history.summary.bestStreak,
        period:
          config.schedule === "flexible"
            ? ("week" as const)
            : config.goalPeriod,
      }
    })
    .sort(
      (a, b) =>
        b.current - a.current ||
        b.best - a.best ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
    )
  return { today: bundle.today, total: items.length, items: items.slice(0, 5) }
}

/** Include today's open goals without treating future plans as missed work. */
export function weeklyHabitProgress(
  bundle: HabitBundle
): WeeklyHabitProgressData {
  const dates = weekDates(bundle.today, bundle.weekStart)
  const rows = bundle.items
    .map((habit) => {
      const history = analyseHabitHistory(
        habit,
        dates[0],
        dates[6],
        bundle.today,
        bundle.weekStart
      )
      const daily = history.days.filter(
        (day) =>
          day.date <= bundle.today &&
          day.goalPeriod === "day" &&
          !day.flexible &&
          day.eligible &&
          day.state !== "skipped"
      )
      const periods = history.periods.filter(
        (period) => period.eligible && period.start <= bundle.today
      )
      return {
        ...overviewHabit(habit),
        days: history.days,
        minutes: history.range.minutes,
        completed:
          daily.filter((day) => day.goalComplete).length +
          periods.filter((period) => period.complete).length,
        eligible: daily.length + periods.length,
      }
    })
    .filter(
      (row) =>
        row.status === "active" ||
        row.days.some(
          (day) => day.amount > 0 || day.minutes > 0 || day.state === "skipped"
        )
    )
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        b.minutes - a.minutes ||
        b.completed - a.completed ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
    )
  return {
    today: bundle.today,
    timezone: bundle.timezone,
    from: dates[0],
    to: dates[6],
    total: rows.length,
    items: rows.slice(0, 5),
  }
}
