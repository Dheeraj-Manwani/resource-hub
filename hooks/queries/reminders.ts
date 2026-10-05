"use client"

import { rowCache } from "@/lib/optimistic/rows"
import { taskCache } from "@/lib/optimistic/domains"
import { syncMutation } from "@/lib/sync/mutations"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { api } from "@/lib/api-client"
import type { DueReminder } from "@/lib/server/dal/reminders"
import type { ReminderDto } from "@/lib/tasks/types"

import { taskKeys } from "./tasks"

const DUE_POLL_MS = 60_000
export const reminderKey = (row: {
  reminderId: string
  occurrenceAt: string
}) => `${row.reminderId}:${row.occurrenceAt}`
export const dueCache = rowCache<DueReminder>(
  "due-reminder",
  ["reminders", "due"],
  reminderKey
)

export function useDueReminders() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ["reminders", "due"],
    queryFn: ({ signal }) =>
      api<{ items: DueReminder[] }>("/api/v1/reminders/due", { signal }).then(
        (data) => ({ ...data, items: dueCache.received(qc, data.items) })
      ),
    select: (d) => dueCache.project(qc, d.items, ["reminders", "due"]),
    refetchInterval: DUE_POLL_MS,
    refetchOnWindowFocus: true,
  })
}

export function useAddReminder() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("reminder.add"),
    mutationFn: ({
      taskId,
      offsetMinutes,
    }: {
      taskId: string
      offsetMinutes: number
    }) =>
      api<ReminderDto>(`/api/v1/tasks/${taskId}/reminders`, {
        method: "POST",
        body: { offsetMinutes },
      }),
    onSuccess: (_reminder, { taskId }) => {
      toast.success("Reminder added")
      return qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
    },
    onError: (error) => toast.error(`Couldn't add reminder: ${error.message}`),
  })
}

export function useDeleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("reminder.delete"),
    mutationFn: ({
      taskId,
      reminderId,
    }: {
      taskId: string
      reminderId: string
    }) =>
      api<null>(`/api/v1/tasks/${taskId}/reminders/${reminderId}`, {
        method: "DELETE",
      }),
    onMutate: async ({ taskId, reminderId }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        token: taskCache.begin(qc, taskId, (task) =>
          task
            ? {
                ...task,
                reminders: task.reminders.filter(
                  (row) => row.id !== reminderId
                ),
              }
            : task
        ),
      }
    },
    onSuccess: (_data, { taskId }, context) => {
      taskCache.commit(qc, taskId, context?.token)
      toast.success("Reminder removed")
      return qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
    },
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      toast.error(`Couldn't remove reminder: ${error.message}`)
    },
  })
}

export function useDismissReminder() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("reminder.dismiss"),
    mutationFn: ({
      reminderId,
      occurrenceAt,
    }: {
      reminderId: string
      occurrenceAt: string
    }) =>
      api<{ dismissed: boolean }>(`/api/v1/reminders/${reminderId}/dismiss`, {
        method: "POST",
        body: { occurrenceAt },
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["reminders", "due"] })
      return { token: dueCache.begin(qc, reminderKey(vars), () => null) }
    },
    onSuccess: (_data, vars, context) =>
      dueCache.commit(qc, reminderKey(vars), context?.token),
    onError: (error, vars, context) => {
      dueCache.settle(qc, reminderKey(vars), context?.token)
      toast.error(error.message)
    },
    onSettled: () =>
      dueCache.pending(qc)
        ? Promise.resolve()
        : qc.invalidateQueries({ queryKey: ["reminders", "due"] }),
  })
}
