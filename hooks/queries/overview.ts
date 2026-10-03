"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api-client"
import type { OverviewSummary } from "@/lib/server/dal/overview"

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: ({ signal }) => api<OverviewSummary>("/api/v1/overview", { signal }),
    staleTime: 10_000,
  })
}
