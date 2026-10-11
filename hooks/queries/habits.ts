"use client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"
import { api } from "@/lib/api-client"
import type { Habit, HabitBundle, HabitLog } from "@/lib/habits/model"
import { syncMutation } from "@/lib/sync/mutations"
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
  operation: "habit.save" | "habit.log" | "habit.correct" | "habit.status"
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
    onSuccess: () => client.invalidateQueries({ queryKey: ["habits"] }),
    onError: (error) => {
      toast.error(error.message)
      void client.invalidateQueries({ queryKey: ["habits"] })
    },
  })
}
