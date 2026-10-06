"use client"

import { rowCache } from "@/lib/optimistic/rows"
import { refreshReferences } from "@/lib/optimistic/references"
import type { TagDto } from "@/lib/resources/dto"
import { syncMutation } from "@/lib/sync/mutations"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { api } from "@/lib/api-client"
import type { TagWithCounts } from "@/lib/server/dal/tags"

const KEY = ["tags", "with-counts"]
export const tagCache = rowCache<TagWithCounts>(
  "tag",
  ["tags"],
  (tag) => tag.id,
  (tag, key) =>
    key[1] !== "search" ||
    !key[2] ||
    tag.name.toLowerCase().includes(String(key[2]).toLowerCase())
)

export function useTagsWithCounts() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      api<{ items: TagWithCounts[] }>("/api/v1/tags/with-counts", {
        signal,
      }).then((data) => ({
        ...data,
        items: tagCache.received(qc, data.items),
      })),
    select: (d) => tagCache.project(qc, d.items, KEY),
  })
}

function invalidateTags(qc: ReturnType<typeof useQueryClient>) {
  if (tagCache.pending(qc)) return Promise.resolve()
  return Promise.all(
    ["tags", "tasks", "resources", "overview", "search", "command-search"].map(
      (root) => qc.invalidateQueries({ queryKey: [root] })
    )
  ).then(() => undefined)
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("tag.create"),
    mutationFn: (name: string) =>
      api<TagDto>("/api/v1/tags", { method: "POST", body: { name } }),
    onSuccess: () => toast.success("Tag created"),
    onError: (error) => toast.error(`Couldn't create tag: ${error.message}`),
    onSettled: () => invalidateTags(qc),
  })
}

export function useRenameTag() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("tag.rename"),
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api<TagDto>(`/api/v1/tags/${id}`, { method: "PATCH", body: { name } }),
    onMutate: async ({ id, name }) => {
      const normalized = name
        .trim()
        .replace(/^#/, "")
        .replace(/\s+/g, " ")
        .toLowerCase()
      const collision = qc
        .getQueryData<{ items: TagDto[] }>(KEY)
        ?.items.some(
          (tag) => tag.id !== id && tag.name.toLowerCase() === normalized
        )
      if (collision) return { token: undefined }
      await Promise.all(
        ["tags", "tasks", "resources", "overview"].map((root) =>
          qc.cancelQueries({ queryKey: [root] })
        )
      )
      const token = tagCache.begin(qc, id, (value) =>
        value ? { ...value, name } : value
      )
      refreshReferences(qc)
      return { token }
    },
    onSuccess: (tag, { id }, context) => {
      const base = tagCache.read(qc, id)
      tagCache.settle(
        qc,
        id,
        context?.token,
        tag.id === id && base ? { ...base, ...tag } : undefined
      )
      refreshReferences(qc)
      toast.success("Tag renamed")
    },
    onError: (error, { id }, context) => {
      tagCache.settle(qc, id, context?.token)
      refreshReferences(qc)
      toast.error(`Couldn't rename: ${error.message}`)
    },
    onSettled: () => invalidateTags(qc),
  })
}

export function useSetTagColor() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("tag.color"),
    mutationFn: ({ id, color }: { id: string; color: string | null }) =>
      api<TagDto>(`/api/v1/tags/${id}`, { method: "PATCH", body: { color } }),
    onMutate: async ({ id, color }) => {
      await Promise.all(
        ["tags", "tasks", "resources", "overview"].map((root) =>
          qc.cancelQueries({ queryKey: [root] })
        )
      )
      const token = tagCache.begin(qc, id, (value) =>
        value ? { ...value, color } : value
      )
      refreshReferences(qc)
      return { token }
    },
    onSuccess: (tag, { id }, context) => {
      const base = tagCache.read(qc, id)
      tagCache.settle(
        qc,
        id,
        context?.token,
        tag.id === id && base ? { ...base, ...tag } : undefined
      )
      refreshReferences(qc)
      toast.success("Tag color updated", { id: "tag-color" })
    },
    onError: (error, { id }, context) => {
      tagCache.settle(qc, id, context?.token)
      refreshReferences(qc)
      toast.error(`Couldn't recolor: ${error.message}`)
    },
    onSettled: () => invalidateTags(qc),
  })
}

export function useMergeTags() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("tag.merge"),
    mutationFn: ({
      sourceIds,
      targetId,
    }: {
      sourceIds: string[]
      targetId: string
    }) =>
      api("/api/v1/tags/merge", {
        method: "POST",
        body: { sourceIds, targetId },
      }),
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
    ...syncMutation("tag.delete"),
    mutationFn: (id: string) =>
      api<null>(`/api/v1/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateTags(qc)
      toast.success("Tag deleted")
    },
    onError: (error) => toast.error(`Couldn't delete: ${error.message}`),
  })
}
