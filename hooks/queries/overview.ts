"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api-client"
import type { OverviewSummary } from "@/lib/overview/model"
import { taskCache, resourceCache } from "@/lib/optimistic/domains"
import { taskKeys } from "./tasks"
import { resourceKeys } from "./resources"

export function useOverview() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ["overview"],
    queryFn: async ({ signal }) => {
      const data = await api<OverviewSummary>("/api/v1/overview", { signal })
      const tasks = [
        ...data.tasks.today,
        ...data.tasks.week,
        ...data.tasks.suggested,
        ...data.projects.top.flatMap((p) => (p.nextTask ? [p.nextTask] : [])),
      ].map((row) => row.task)
      for (const task of [...tasks, ...data.tasks.blocked]) {
        qc.setQueryData(taskKeys.detail(task.id), taskCache.received(qc, task))
      }
      for (const resource of [
        ...data.resources.toReview,
        ...data.projects.top.flatMap((p) => p.resources),
      ]) {
        qc.setQueryData(
          resourceKeys.detail(resource.id),
          resourceCache.received(qc, resource)
        )
      }
      return data
    },
    staleTime: 10_000,
    refetchInterval: 60_000,
  })
}
