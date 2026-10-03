"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, toQueryString } from "@/lib/api-client"
import type { CalendarOccurrence } from "@/lib/server/dal/calendar"
import type { TaskDto, TaskPriority, TaskStatus } from "@/lib/tasks/types"
import type { OccurrenceEditInput } from "@/lib/validation/calendar"

import { invalidateTaskLists, upsertTaskInCache } from "./tasks"

export type CalendarFilters = {
  projectId?: string
  includeDescendants?: boolean
  tag?: string
  status?: TaskStatus
  priority?: TaskPriority
}

export function useCalendarOccurrences(range: { from: Date; to: Date }, filters: CalendarFilters) {
  return useQuery({
    queryKey: ["calendar", range.from.toISOString(), range.to.toISOString(), filters],
    queryFn: ({ signal }) =>
      api<{ items: CalendarOccurrence[] }>(
        `/api/v1/calendar${toQueryString({
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          projectId: filters.projectId,
          includeDescendants: filters.includeDescendants ? "true" : undefined,
          tag: filters.tag,
          status: filters.status,
        })}`,
        { signal }
      ),
    select: (d) => d.items,
  })
}

function invalidateCalendar(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: ["calendar"] })
}

/** Edits (or completes) one occurrence of a recurring task — see the DAL's
 * `editOccurrence` for what `this`/`following`/`all` each do. */
export function useEditOccurrence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: OccurrenceEditInput }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/occurrences`, { method: "PATCH", body: input }),
    onSuccess: (task) => {
      upsertTaskInCache(qc, task)
      invalidateTaskLists(qc)
      invalidateCalendar(qc)
    },
    onError: (error) => toast.error(`Couldn't update: ${error.message}`),
  })
}

export function useCompleteOccurrence() {
  const edit = useEditOccurrence()
  return {
    ...edit,
    complete: (taskId: string, occurrenceAt: string) =>
      edit.mutate({ taskId, input: { occurrenceAt, scope: "this", patch: { status: "done" } } }),
  }
}
