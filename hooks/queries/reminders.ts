"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api-client"
import type { DueReminder } from "@/lib/server/dal/reminders"
import type { ReminderDto } from "@/lib/tasks/types"

import { taskKeys } from "./tasks"

const DUE_POLL_MS = 60_000

export function useDueReminders() {
  return useQuery({
    queryKey: ["reminders", "due"],
    queryFn: ({ signal }) => api<{ items: DueReminder[] }>("/api/v1/reminders/due", { signal }),
    select: (d) => d.items,
    refetchInterval: DUE_POLL_MS,
    refetchOnWindowFocus: true,
  })
}

export function useAddReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, offsetMinutes }: { taskId: string; offsetMinutes: number }) =>
      api<ReminderDto>(`/api/v1/tasks/${taskId}/reminders`, { method: "POST", body: { offsetMinutes } }),
    onSuccess: (_reminder, { taskId }) => qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) }),
    onError: (error) => toast.error(`Couldn't add reminder: ${error.message}`),
  })
}

export function useDeleteReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, reminderId }: { taskId: string; reminderId: string }) =>
      api<null>(`/api/v1/tasks/${taskId}/reminders/${reminderId}`, { method: "DELETE" }),
    onSuccess: (_data, { taskId }) => qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) }),
    onError: (error) => toast.error(`Couldn't remove reminder: ${error.message}`),
  })
}

export function useDismissReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reminderId, occurrenceAt }: { reminderId: string; occurrenceAt: string }) =>
      api<{ dismissed: boolean }>(`/api/v1/reminders/${reminderId}/dismiss`, {
        method: "POST",
        body: { occurrenceAt },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders", "due"] }),
    onError: (error) => toast.error(error.message),
  })
}
