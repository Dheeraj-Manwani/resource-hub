import "server-only"

import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/lib/db"
import { tasks, taskTags } from "@/lib/db/schema"
import { expandOccurrences } from "@/lib/tasks/recurrence"
import type { IcsTask } from "@/lib/tasks/ics"
import type { TaskPriority, TaskStatus } from "@/lib/tasks/types"

import { taskDtstart } from "./tasks"

export type CalendarOccurrence = {
  /** Unique per occurrence (`taskId:isoInstant`), for the calendar's own event id. */
  id: string
  taskId: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  projectId: string | null
  /** Full ISO datetime when timed, `YYYY-MM-DD` when `allDay`. */
  start: string
  end: string | null
  allDay: boolean
  /** True for a series master's expanded occurrence or a detached exception. */
  isRecurring: boolean
  /** The series master's task id (itself, for a master's own expansion). */
  seriesId: string | null
}

type TaskRow = typeof tasks.$inferSelect

function dateOnly(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function inRange(d: Date, from: Date, to: Date) {
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime()
}

function masterOccurrences(row: TaskRow, from: Date, to: Date): CalendarOccurrence[] {
  const dtstart = taskDtstart(row)
  const durationMs = row.startAt && row.dueAt ? row.dueAt.getTime() - row.startAt.getTime() : 0
  const instants = expandOccurrences(row.rrule!, dtstart, from, to, row.exdates ?? [])
  return instants.map((occ) => ({
    id: `${row.id}:${occ.toISOString()}`,
    taskId: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    projectId: row.projectId,
    start: row.allDay ? dateOnly(occ) : occ.toISOString(),
    end: !row.allDay && durationMs ? new Date(occ.getTime() + durationMs).toISOString() : null,
    allDay: row.allDay,
    isRecurring: true,
    seriesId: row.id,
  }))
}

function singleOccurrence(row: TaskRow, from: Date, to: Date, seriesId: string | null): CalendarOccurrence | null {
  if (row.allDay) {
    const dateStr = row.dueDate ?? row.startDate
    if (!dateStr) return null
    const d = new Date(`${dateStr}T00:00:00.000Z`)
    if (!inRange(d, from, to)) return null
    return {
      id: `${row.id}:${d.toISOString()}`,
      taskId: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      projectId: row.projectId,
      start: dateStr,
      end: null,
      allDay: true,
      isRecurring: seriesId !== null,
      seriesId,
    }
  }
  const instant = row.dueAt ?? row.startAt
  if (!instant || !inRange(instant, from, to)) return null
  return {
    id: `${row.id}:${instant.toISOString()}`,
    taskId: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    projectId: row.projectId,
    start: (row.startAt ?? instant).toISOString(),
    end: row.startAt && row.dueAt ? row.dueAt.toISOString() : null,
    allDay: false,
    isRecurring: seriesId !== null,
    seriesId,
  }
}

export type CalendarFilters = {
  projectIds?: string[]
  tag?: string
  status?: TaskStatus
}

/**
 * Expands every task into its occurrences for `[from, to]`: a plain task
 * contributes at most one occurrence, a recurring series master expands via
 * `rrule`, and a detached exception (edited/completed single occurrence)
 * contributes its own one — the master's `exdates` already excludes that
 * date from its own expansion, so nothing is double-counted. Scoped to a
 * single user's tasks, so this always runs over a small personal set.
 */
export async function getCalendarOccurrences(
  userId: string,
  range: { from: Date; to: Date },
  filters: CalendarFilters
): Promise<CalendarOccurrence[]> {
  const conditions: SQL[] = [
    eq(tasks.userId, userId),
    isNull(tasks.deletedAt),
    isNull(tasks.archivedAt),
    or(sql`${tasks.dueAt} is not null`, sql`${tasks.dueDate} is not null`, sql`${tasks.rrule} is not null`)!,
  ]
  if (filters.projectIds?.length) conditions.push(inArray(tasks.projectId, filters.projectIds))
  if (filters.status) conditions.push(eq(tasks.status, filters.status))
  if (filters.tag) {
    conditions.push(
      sql`exists (select 1 from ${taskTags} where ${taskTags.taskId} = ${tasks.id} and ${taskTags.tagId} = ${filters.tag})`
    )
  }

  const rows = await db.select().from(tasks).where(and(...conditions))
  const occurrences: CalendarOccurrence[] = []
  for (const row of rows) {
    if (row.rrule && !row.seriesId) {
      occurrences.push(...masterOccurrences(row, range.from, range.to))
    } else {
      const occ = singleOccurrence(row, range.from, range.to, row.seriesId)
      if (occ) occurrences.push(occ)
    }
  }
  return occurrences
}

/** Every dated (or recurring) task for the ICS feed — series masters keep
 * their own RRULE/EXDATE for the calendar client to expand natively, so
 * this is a flat per-task fetch, not an occurrence expansion. */
export async function tasksForIcs(userId: string): Promise<IcsTask[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt),
        or(sql`${tasks.dueAt} is not null`, sql`${tasks.dueDate} is not null`, sql`${tasks.rrule} is not null`)!
      )
    )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    startAt: row.startAt,
    dueAt: row.dueAt,
    startDate: row.startDate,
    dueDate: row.dueDate,
    allDay: row.allDay,
    rrule: row.rrule,
    exdates: row.exdates,
    seriesId: row.seriesId,
    originalOccurrenceAt: row.originalOccurrenceAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}
