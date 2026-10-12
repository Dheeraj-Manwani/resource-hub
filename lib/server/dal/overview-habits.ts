import "server-only"

import { and, desc, eq, isNull, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  habits,
  habitLogs,
  habitOccurrences,
  habitVersions,
} from "@/lib/db/schema"
import { goalMinutes, goalUnit, todayIn, weekDates } from "@/lib/habits/model"
import { roundWork } from "@/lib/habits/history"
import {
  habitStreaks,
  overviewHabit,
  weeklyHabitProgress,
  type RecentHabitActivityData,
} from "@/lib/overview/habit-sections"
import { listHabits } from "./habits"
import { getSettings } from "./settings"

export async function getHabitStreaks(userId: string) {
  // Lifetime records are required: a month-only bundle would truncate long streaks.
  return habitStreaks(await listHabits(userId, "1900-01-01", "2200-12-31"))
}
export async function getWeeklyHabitProgress(userId: string) {
  const settings = await getSettings(userId)
  const dates = weekDates(todayIn(settings.timezone), settings.weekStart)
  return weeklyHabitProgress(await listHabits(userId, dates[0], dates[6]))
}
export async function getRecentHabitActivity(
  userId: string
): Promise<RecentHabitActivityData> {
  const settings = await getSettings(userId)
  const today = todayIn(settings.timezone)
  const rows = await db
    .select({
      id: habitLogs.id,
      date: habitLogs.date,
      kind: habitLogs.kind,
      source: habitLogs.source,
      amount: habitLogs.amount,
      elapsedMs: habitLogs.elapsedMs,
      notes: habitLogs.notes,
      updatedAt: habitLogs.updatedAt,
      habitId: habits.id,
      name: habits.name,
      icon: habits.icon,
      color: habits.color,
      status: habits.status,
      config: habitVersions.config,
    })
    .from(habitLogs)
    .innerJoin(habits, eq(habits.id, habitLogs.habitId))
    .innerJoin(
      habitOccurrences,
      and(
        eq(habitOccurrences.id, habitLogs.occurrenceId),
        eq(habitOccurrences.habitId, habits.id)
      )
    )
    .innerJoin(
      habitVersions,
      and(
        eq(habitVersions.id, habitOccurrences.versionId),
        eq(habitVersions.habitId, habits.id)
      )
    )
    .where(
      and(
        eq(habits.userId, userId),
        isNull(habitLogs.deletedAt),
        lte(habitLogs.date, today)
      )
    )
    .orderBy(desc(habitLogs.updatedAt), desc(habitLogs.id))
    .limit(6)
  return {
    today,
    timezone: settings.timezone,
    items: rows.map((row) => ({
      id: row.id,
      habit: overviewHabit({ ...row, id: row.habitId }),
      date: row.date,
      kind: row.kind,
      source: row.source,
      amount: row.amount,
      unit: goalUnit(row.config),
      minutes: roundWork(
        row.source === "timer"
          ? (row.elapsedMs ?? 0) / 60000
          : row.kind === "progress"
            ? goalMinutes(row.config, row.amount)
            : 0
      ),
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    })),
  }
}
