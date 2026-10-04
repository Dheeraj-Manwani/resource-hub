"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { api } from "@/lib/api-client"
import type { TrashEntityType, TrashItem } from "@/lib/server/dal/trash"

const KEY = ["trash"]

export function useTrash() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => api<{ items: TrashItem[] }>("/api/v1/trash", { signal }),
    select: (d) => d.items,
  })
}

function invalidateAfterTrashChange(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: KEY })
  void qc.invalidateQueries({ queryKey: ["resources"] })
  void qc.invalidateQueries({ queryKey: ["tasks"] })
  void qc.invalidateQueries({ queryKey: ["projects"] })
}

export function useRestoreFromTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entityType, id }: { entityType: TrashEntityType; id: string }) =>
      api(`/api/v1/trash/${entityType}/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      invalidateAfterTrashChange(qc)
      toast.success("Restored")
    },
    onError: (error) => toast.error(`Couldn't restore: ${error.message}`),
  })
}

export function usePermanentlyDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entityType, id }: { entityType: TrashEntityType; id: string }) =>
      api<null>(`/api/v1/trash/${entityType}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateAfterTrashChange(qc)
      toast.success("Deleted permanently")
    },
    onError: (error) => toast.error(`Couldn't delete: ${error.message}`),
  })
}

export function useEmptyTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ deleted: number }>("/api/v1/trash/empty", { method: "POST" }),
    onSuccess: ({ deleted }) => {
      invalidateAfterTrashChange(qc)
      toast.success(`Permanently deleted ${deleted} item${deleted === 1 ? "" : "s"}`)
    },
    onError: (error) => toast.error(`Couldn't empty Trash: ${error.message}`),
  })
}
