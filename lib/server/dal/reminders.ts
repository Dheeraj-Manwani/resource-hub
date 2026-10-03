import "server-only"

import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import { taskReminders, tasks } from "@/lib/db/schema"
import { expandOccurrences } from "@/lib/tasks/recurrence"
import type { ReminderDto } from "@/lib/tasks/types"

import { getTaskRow, taskDtstart } from "./tasks"

function toDto(row: typeof taskReminders.$inferSelect): ReminderDto {
  return { id: row.id, taskId: row.taskId, offsetMinutes: row.offsetMinutes }
}

export async function remindersForTask(taskId: string): Promise<ReminderDto[]> {
  const rows = await db
    .select()
    .from(taskReminders)
    .where(eq(taskReminders.taskId, taskId))
    .orderBy(asc(taskReminders.offsetMinutes))
  return rows.map(toDto)
}

export async function addReminder(
  userId: string,
  taskId: string,
  offsetMinutes: number
): Promise<ReminderDto | null> {
  const task = await getTaskRow(userId, taskId)
  if (!task) return null
  const id = uuidv7()
  await db.insert(taskReminders).values({ id, taskId, offsetMinutes })
  return { id, taskId, offsetMinutes }
}

export async function deleteReminder(userId: string, taskId: string, reminderId: string): Promise<boolean> {
  const task = await getTaskRow(userId, taskId)
  if (!task) return false
  await db
    .delete(taskReminders)
    .where(and(eq(taskReminders.id, reminderId), eq(taskReminders.taskId, taskId)))
  return true
}

export type DueReminder = {
  reminderId: string
  taskId: string
  title: string
  /** The specific occurrence this reminder fired for. */
  occurrenceAt: string
  offsetMinutes: number
  fireAt: string
}

/**
 * Reminders whose fire time (`occurrence - offsetMinutes`) has passed within
 * `lookbackMinutes` of `now`, for each task's relevant occurrence(s) in that
 * window — recurring tasks only expand that narrow window, not the whole
 * series. Already-dismissed-for-that-occurrence reminders are excluded, so a
 * recurring task's *next* occurrence reminds again even after this one was
 * dismissed.
 */
export async function dueReminders(
  userId: string,
  now: Date,
  lookbackMinutes = 60 * 24
): Promise<DueReminder[]> {
  const rows = await db
    .select({ reminder: taskReminders, task: tasks })
    .from(taskReminders)
    .innerJoin(tasks, eq(tasks.id, taskReminders.taskId))
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt),
        sql`${tasks.status} != 'done'`
      )
    )

  const lookbackStart = new Date(now.getTime() - lookbackMinutes * 60_000)
  const lookaheadEnd = new Date(now.getTime() + 24 * 60 * 60_000)
  const result: DueReminder[] = []

  for (const { reminder, task } of rows) {
    let instants: Date[]
    if (task.rrule && !task.seriesId) {
      instants = expandOccurrences(task.rrule, taskDtstart(task), lookbackStart, lookaheadEnd, task.exdates ?? [])
    } else {
      const instant = task.allDay
        ? task.dueDate
          ? new Date(`${task.dueDate}T00:00:00.000Z`)
          : null
        : task.dueAt ?? task.startAt
      instants = instant ? [instant] : []
    }
    for (const occurrenceAt of instants) {
      const fireAt = new Date(occurrenceAt.getTime() - reminder.offsetMinutes * 60_000)
      if (fireAt.getTime() > now.getTime()) continue
      if (reminder.dismissedFor && reminder.dismissedFor.getTime() === occurrenceAt.getTime()) continue
      result.push({
        reminderId: reminder.id,
        taskId: task.id,
        title: task.title,
        occurrenceAt: occurrenceAt.toISOString(),
        offsetMinutes: reminder.offsetMinutes,
        fireAt: fireAt.toISOString(),
      })
    }
  }
  result.sort((a, b) => a.fireAt.localeCompare(b.fireAt))
  return result
}

export async function dismissReminder(
  userId: string,
  reminderId: string,
  occurrenceAt: Date
): Promise<boolean> {
  const [row] = await db
    .select({ id: taskReminders.id })
    .from(taskReminders)
    .innerJoin(tasks, eq(tasks.id, taskReminders.taskId))
    .where(and(eq(taskReminders.id, reminderId), eq(tasks.userId, userId)))
    .limit(1)
  if (!row) return false
  await db.update(taskReminders).set({ dismissedFor: occurrenceAt }).where(eq(taskReminders.id, reminderId))
  return true
}
