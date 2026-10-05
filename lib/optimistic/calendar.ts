import type { QueryClient } from "@tanstack/react-query"
import type { CalendarOccurrence } from "@/lib/server/dal/calendar"
import type { OccurrenceEditInput } from "@/lib/validation/calendar"
import { rowCache } from "./rows"
import { inProject } from "./lists"

export const occurrenceCache = rowCache<CalendarOccurrence>(
  "calendar-occurrence",
  ["calendar"],
  (row) => row.id,
  (row, key, client) => {
    const filters = key[3] as
      | { status?: string; projectId?: string; includeDescendants?: boolean }
      | undefined
    if (filters?.status && row.status !== filters.status) return false
    if (
      filters?.projectId &&
      inProject(
        client,
        row.projectId,
        filters.projectId,
        filters.includeDescendants
      ) === false
    )
      return false
    const instant = row.allDay
      ? `${row.start}T00:00:00.000Z`
      : row.isRecurring
        ? row.start
        : (row.end ?? row.start)
    return instant >= String(key[1]) && instant <= String(key[2])
  }
)
export function patchOccurrence(
  row: CalendarOccurrence,
  patch: OccurrenceEditInput["patch"]
): CalendarOccurrence | null {
  if (row.isRecurring || row.seriesId) return row
  const dates = {
    allDay: row.allDay,
    dueDate: row.allDay ? row.start : null,
    startDate: null as string | null,
    dueAt: row.allDay ? null : (row.end ?? row.start),
    startAt: row.allDay ? null : row.end ? row.start : null,
    ...patch,
  }
  const start = dates.allDay
    ? (dates.dueDate ?? dates.startDate)
    : (dates.startAt ?? dates.dueAt)
  if (!start) return null
  return {
    ...row,
    title: patch.title ?? row.title,
    status: patch.status ?? row.status,
    priority: patch.priority ?? row.priority,
    projectId: patch.projectId === undefined ? row.projectId : patch.projectId,
    allDay: dates.allDay,
    start,
    end: !dates.allDay && dates.startAt && dates.dueAt ? dates.dueAt : null,
  }
}
export function calendarRows(client: QueryClient, taskId: string) {
  return [
    ...new Map(
      client
        .getQueriesData<{ items: CalendarOccurrence[] }>({
          queryKey: ["calendar"],
        })
        .flatMap(([, data]) => data?.items ?? [])
        .filter((row) => row.taskId === taskId)
        .map((row) => [row.id, row])
    ).values(),
  ]
}
