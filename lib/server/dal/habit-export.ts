import "server-only"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  habits,
  habitOccurrences,
  habitMilestones,
  habitReminderStates,
  habitTimerSessions,
} from "@/lib/db/schema"
import { habitDetails } from "./habits"
export async function buildHabitExport(userId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(habits)
      .where(eq(habits.userId, userId))
      .orderBy(asc(habits.createdAt))
    return Promise.all(
      rows.map(async (row) => {
        const [habit, sessions, reminders, occurrences, milestones] =
          await Promise.all([
            habitDetails(tx, row, "1900-01-01", "2200-12-31"),
            tx
              .select()
              .from(habitTimerSessions)
              .where(
                and(
                  eq(habitTimerSessions.habitId, row.id),
                  eq(habitTimerSessions.userId, userId)
                )
              )
              .orderBy(asc(habitTimerSessions.createdAt)),
            tx
              .select()
              .from(habitReminderStates)
              .where(eq(habitReminderStates.habitId, row.id)),
            tx
              .select()
              .from(habitOccurrences)
              .where(eq(habitOccurrences.habitId, row.id)),
            tx
              .select()
              .from(habitMilestones)
              .where(eq(habitMilestones.habitId, row.id)),
          ])
        return {
          ...habit,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          milestones: milestones.map((m) => ({
            key: m.key,
            celebratedAt: m.celebratedAt.toISOString(),
          })),
          occurrences: occurrences.map((occurrence) => ({
            ...occurrence,
            celebratedAt: occurrence.celebratedAt?.toISOString() ?? null,
          })),
          sessions: sessions.map((session) => ({
            id: session.id,
            timezone: session.timezone,
            mode: session.mode,
            pomodoro: session.pomodoro,
            status: session.status,
            targetMs: session.targetMs,
            runningSince: session.runningSince?.toISOString() ?? null,
            segments: session.segments,
            confirmedMs: session.confirmedMs,
            notes: session.notes,
            goal: session.goal,
            revision: session.revision,
            createdAt: session.createdAt.toISOString(),
            updatedAt: session.updatedAt.toISOString(),
          })),
          reminders: reminders.map((state) => ({
            versionId: state.versionId,
            date: state.date,
            time: state.time,
            dismissedAt: state.dismissedAt?.toISOString() ?? null,
            snoozedUntil: state.snoozedUntil?.toISOString() ?? null,
          })),
        }
      })
    )
  })
}
