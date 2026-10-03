"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api-client"
import type { TagWithCounts } from "@/lib/server/dal/tags"

const KEY = ["tags", "with-counts"]

export function useTagsWithCounts() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      api<{ items: TagWithCounts[] }>("/api/v1/tags/with-counts", { signal }),
    select: (d) => d.items,
  })
}

function invalidateTags(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: KEY })
  void qc.invalidateQueries({ queryKey: ["tags"] })
}

export function useRenameTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api(`/api/v1/tags/${id}`, { method: "PATCH", body: { name } }),
    onSuccess: () => invalidateTags(qc),
    onError: (error) => toast.error(`Couldn't rename: ${error.message}`),
  })
}

export function useSetTagColor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, color }: { id: string; color: string | null }) =>
      api(`/api/v1/tags/${id}`, { method: "PATCH", body: { color } }),
    onSuccess: () => invalidateTags(qc),
    onError: (error) => toast.error(`Couldn't recolor: ${error.message}`),
  })
}

export function useMergeTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sourceIds, targetId }: { sourceIds: string[]; targetId: string }) =>
      api("/api/v1/tags/merge", { method: "POST", body: { sourceIds, targetId } }),
    onSuccess: () => {
      invalidateTags(qc)
      toast.success("Tags merged")
    },
    onError: (error) => toast.error(`Couldn't merge: ${error.message}`),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/api/v1/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateTags(qc)
      toast.success("Tag deleted")
    },
    onError: (error) => toast.error(`Couldn't delete: ${error.message}`),
  })
}
