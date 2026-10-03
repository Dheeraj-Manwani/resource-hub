"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api-client"
import type { SettingsDto } from "@/lib/server/dal/settings"

export function useSettings(initialData?: SettingsDto) {
  return useQuery({
    queryKey: ["settings"],
    queryFn: ({ signal }) => api<SettingsDto>("/api/v1/settings", { signal }),
    initialData,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<SettingsDto>) =>
      api<SettingsDto>("/api/v1/settings", { method: "PATCH", body: patch }),
    onMutate: (patch) => {
      const previous = qc.getQueryData<SettingsDto>(["settings"])
      if (previous) qc.setQueryData(["settings"], { ...previous, ...patch })
      return { previous }
    },
    onError: (error, _patch, context) => {
      if (context?.previous) qc.setQueryData(["settings"], context.previous)
      toast.error(error.message)
    },
    onSuccess: (settings) => qc.setQueryData(["settings"], settings),
  })
}
