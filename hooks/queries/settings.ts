"use client"

import { journalFor } from "@/lib/optimistic/journal"

import { syncMutation } from "@/lib/sync/mutations"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { api } from "@/lib/api-client"
import type { SettingsDto } from "@/lib/server/dal/settings"

export function useSettings(initialData?: SettingsDto) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ["settings"],
    queryFn: async ({ signal }) => {
      const data = await api<SettingsDto>("/api/v1/settings", { signal })
      journalFor<SettingsDto>(qc, "settings").rebase("settings", data)
      return data
    },
    initialData,
    select: (data) =>
      journalFor<SettingsDto>(qc, "settings").project("settings", data) ?? data,
    staleTime: 5 * 60_000,
  })
}

export function useRegenerateIcsToken() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("settings.feed"),
    mutationFn: () =>
      api<{ icsToken: string }>("/api/v1/settings/ics-token", {
        method: "POST",
      }),
    onSuccess: ({ icsToken }) => {
      toast.success("Calendar subscription link generated")
      qc.setQueryData<SettingsDto>(["settings"], (prev) =>
        prev ? { ...prev, icsToken } : prev
      )
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("settings.update"),
    mutationFn: (patch: Partial<SettingsDto>) =>
      api<SettingsDto>("/api/v1/settings", { method: "PATCH", body: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["settings"] })
      return {
        token: journalFor<SettingsDto>(qc, "settings").begin(
          "settings",
          qc.getQueryData<SettingsDto>(["settings"]) ?? null,
          (current) => (current ? { ...current, ...patch } : current),
          (value) => {
            if (value) qc.setQueryData(["settings"], value)
          }
        ),
      }
    },
    onError: (error, _patch, context) => {
      journalFor<SettingsDto>(qc, "settings").settle("settings", context?.token)
      toast.error(error.message)
    },
    onSuccess: (settings, patch, context) => {
      journalFor<SettingsDto>(qc, "settings").settle(
        "settings",
        context?.token,
        settings
      )
      if (
        patch.timezone !== undefined ||
        patch.weekStart !== undefined ||
        patch.calendarColorMode !== undefined
      ) {
        toast.success("Calendar settings saved", { id: "calendar-settings" })
      }
    },
  })
}
