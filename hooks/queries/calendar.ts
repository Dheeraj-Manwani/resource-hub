"use client"

import {
  occurrenceCache,
  patchOccurrence,
  calendarRows,
} from "@/lib/optimistic/calendar"
import { taskCache } from "@/lib/optimistic/domains"
import { syncMutation } from "@/lib/sync/mutations"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { api, toQueryString } from "@/lib/api-client"
import type { CalendarOccurrence } from "@/lib/server/dal/calendar"
import type { TaskDto, TaskPriority, TaskStatus } from "@/lib/tasks/types"
import type { OccurrenceEditInput } from "@/lib/validation/calendar"

import { applyPatch, invalidateTaskLists, upsertTaskInCache } from "./tasks"

export type CalendarFilters = {
  projectId?: string
  includeDescendants?: boolean
  tag?: string
  status?: TaskStatus
  priority?: TaskPriority
}

export function useCalendarOccurrences(
  range: { from: Date; to: Date },
  filters: CalendarFilters,
  enabled = true
) {
  const qc = useQueryClient()
  return useQuery({
    enabled,
    queryKey: [
      "calendar",
      range.from.toISOString(),
      range.to.toISOString(),
      filters,
    ],
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
      ).then((data) => ({
        ...data,
        items: occurrenceCache.received(qc, data.items),
      })),
    select: (d) =>
      occurrenceCache.project(qc, d.items, [
        "calendar",
        range.from.toISOString(),
        range.to.toISOString(),
        filters,
      ]),
  })
}

function invalidateCalendar(qc: ReturnType<typeof useQueryClient>) {
  return occurrenceCache.pending(qc)
    ? Promise.resolve()
    : qc.invalidateQueries({ queryKey: ["calendar"] })
}

/** Edits (or completes) one occurrence of a recurring task — see the DAL's
 * `editOccurrence` for what `this`/`following`/`all` each do. */
export function useEditOccurrence() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("calendar.edit"),
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string
      input: OccurrenceEditInput
    }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/occurrences`, {
        method: "PATCH",
        body: input,
      }),
    onMutate: async ({ taskId, input }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ["calendar"] }),
        qc.cancelQueries({ queryKey: ["tasks"] }),
      ])
      const task = taskCache.read(qc, taskId),
        rows = calendarRows(qc, taskId)
      const safe = task
        ? !task.rrule && !task.seriesId
        : rows.length > 0 &&
          rows.every((row) => !row.isRecurring && !row.seriesId)
      if (!safe)
        return {
          calendarTokens: [] as { id: string; token: string }[],
          token: undefined as string | undefined,
        }
      return {
        token: task
          ? taskCache.begin(qc, taskId, (row) =>
              row ? applyPatch(row, input.patch, qc) : row
            )
          : undefined,
        calendarTokens: rows.map((row) => ({
          id: row.id,
          token: occurrenceCache.begin(qc, row.id, (value) =>
            value ? patchOccurrence(value, input.patch) : value
          ),
        })),
      }
    },
    onSuccess: (task, { taskId }, context) => {
      if (context?.token) taskCache.settle(qc, taskId, context.token, task)
      else upsertTaskInCache(qc, task)
      context?.calendarTokens.forEach(({ id, token }) =>
        occurrenceCache.commit(qc, id, token)
      )
    },
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      context?.calendarTokens.forEach(({ id, token }) =>
        occurrenceCache.settle(qc, id, token)
      )
      toast.error(`Couldn't update: ${error.message}`)
    },
    onSettled: () =>
      Promise.all([invalidateTaskLists(qc), invalidateCalendar(qc)]).then(
        () => undefined
      ),
  })
}

export function useCompleteOccurrence() {
  const edit = useEditOccurrence()
  return {
    ...edit,
    complete: (taskId: string, occurrenceAt: string) =>
      edit.mutate({
        taskId,
        input: { occurrenceAt, scope: "this", patch: { status: "done" } },
      }),
  }
}
