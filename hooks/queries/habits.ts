"use client"
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "react-hot-toast"
import { api } from "@/lib/api-client"
import type { Habit, HabitBundle, HabitLog } from "@/lib/habits/model"
import { syncMutation } from "@/lib/sync/mutations"
import type {
  DueHabitReminder,
  HabitReminderAction,
} from "@/lib/habits/planning"
import type { habitCalendar } from "@/lib/server/dal/habit-planning"
import type { habitHistory } from "@/lib/server/dal/habit-history"
import type { HistoryView } from "@/lib/habits/history"
export function invalidateHabitViews(client: QueryClient) {
  return Promise.all(
    [
      "habits",
      "habit-calendar",
      "habit-reminders",
      "habit-history",
      "search",
      "command-search",
    ].map((key) => client.invalidateQueries({ queryKey: [key] }))
  )
}
export function useHabitHistory(date: string, view: HistoryView, habitId?: string) {
  const params = new URLSearchParams({ view })
  if (date) params.set("date", date)
  if (habitId) params.set("habitId", habitId)
  return useQuery({ queryKey: ["habit-history", date, view, habitId], queryFn: ({signal}) => api<Awaited<ReturnType<typeof habitHistory>>>(`/api/v1/habits/history?${params}`,{signal}), staleTime: 15000, refetchInterval: 60000 })
}
export function useHabitCalendar(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["habit-calendar", from, to],
    queryFn: ({ signal }) =>
      api<Awaited<ReturnType<typeof habitCalendar>>>(
        `/api/v1/habits/calendar?from=${from}&to=${to}`,
        { signal }
      ),
    enabled,
    staleTime: 15000,
    refetchInterval: 60000,
  })
}
export function useHabitReminders() {
  return useQuery({
    queryKey: ["habit-reminders"],
    queryFn: ({ signal }) =>
      api<{ items: DueHabitReminder[] }>("/api/v1/habits/reminders", {
        signal,
      }),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  })
}
export function useHabitReminderAction() {
  const client = useQueryClient()
  return useMutation({
    ...syncMutation("habit.reminder"),
    mutationFn: ({ id, body }: { id: string; body: HabitReminderAction }) =>
      api(`/api/v1/habits/${id}/reminders`, { method: "POST", body }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["habit-reminders"] }),
    onError: (error) => toast.error(error.message),
  })
}
export function useHabits(date: string, enabled = true) {
  return useQuery({
    queryKey: ["habits", date],
    queryFn: ({ signal }) =>
      api<HabitBundle>(`/api/v1/habits${date ? `?date=${date}` : ""}`, {
        signal,
      }),
    staleTime: 15000,
    refetchInterval: 60000,
    enabled,
  })
}
type WriteResult = {
  habit?: Habit
  log?: HabitLog
  created?: boolean
  completed?: boolean
  effectiveFrom?: string
  progress?: { amount: number; target: number }
}
export function useHabitWrite(
  operation:
    "habit.save" | "habit.log" | "habit.correct" | "habit.status" | "habit.plan"
) {
  const client = useQueryClient()
  return useMutation({
    ...syncMutation(operation),
    mutationFn: (input: {
      id: string
      path: string
      method: "POST" | "PATCH"
      body: unknown
    }) =>
      api<WriteResult>(`/api/v1/habits${input.path}`, {
        method: input.method,
        body: input.body,
      }),
    onSuccess: () => invalidateHabitViews(client),
    onError: (error) => {
      toast.error(error.message)
      void client.invalidateQueries({ queryKey: ["habits"] })
    },
  })
}
