"use client"

import { replaceTags } from "@/lib/optimistic/actions"
import { resourceCache } from "@/lib/optimistic/domains"

import { useSyncController } from "@/components/sync-provider"

import { syncMutation } from "@/lib/sync/mutations"

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "react-hot-toast"
import { showToast } from "@/lib/toast"

import { api, toQueryString } from "@/lib/api-client"
import type { ResourceDto, ResourcePage, TagDto } from "@/lib/resources/dto"
import type { ResourceType } from "@/lib/resources/types"
import type { UpdateResourceInput } from "@/lib/validation/resources"

export type ResourceFilters = {
  type?: ResourceType
  tag?: string
  favorite?: boolean
  reviewed?: boolean
  unsorted?: boolean
  hasTasks?: boolean
  projectId?: string
  includeDescendants?: boolean
  sort?: "created" | "updated" | "title"
  order?: "asc" | "desc"
}

export const resourceKeys = {
  all: ["resources"] as const,
  lists: () => ["resources", "list"] as const,
  list: (filters: ResourceFilters) => ["resources", "list", filters] as const,
  detail: (id: string) => ["resources", "detail", id] as const,
  readme: (id: string) => ["resources", "readme", id] as const,
}

export function useResourceList(filters: ResourceFilters) {
  const qc = useQueryClient()
  return useInfiniteQuery({
    queryKey: resourceKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<ResourcePage>(
        `/api/v1/resources${toQueryString({
          ...filters,
          favorite:
            filters.favorite === undefined
              ? undefined
              : String(filters.favorite),
          reviewed:
            filters.reviewed === undefined
              ? undefined
              : String(filters.reviewed),
          unsorted: filters.unsorted ? "true" : undefined,
          hasTasks:
            filters.hasTasks === undefined
              ? undefined
              : String(filters.hasTasks),
          includeDescendants: filters.includeDescendants ? "true" : undefined,
          cursor: pageParam ?? undefined,
        })}`,
        { signal }
      ).then((page) => {
        page.items.forEach((item) => resourceCache.received(qc, item))
        return page
      }),
    getNextPageParam: (last) => last.nextCursor,
    select: (data) => resourceCache.projectList(qc, data, filters),
  })
}

function findInLists(qc: QueryClient, id: string): ResourceDto | undefined {
  for (const [, data] of qc.getQueriesData<InfiniteData<ResourcePage>>({
    queryKey: resourceKeys.lists(),
  })) {
    for (const page of data?.pages ?? []) {
      const found = page.items.find((r) => r.id === id)
      if (found) return found
    }
  }
  return undefined
}

export function useResource(id: string | null) {
  const qc = useQueryClient()
  return useQuery<ResourceDto>({
    queryKey: resourceKeys.detail(id ?? ""),
    enabled: !!id,
    queryFn: ({ signal }) =>
      api<ResourceDto>(`/api/v1/resources/${id}`, { signal }).then((value) =>
        resourceCache.received(qc, value)
      ),
    placeholderData: (): ResourceDto | undefined =>
      id ? findInLists(qc, id) : undefined,
  })
}

/** Writes a resource into every cached list and its detail entry. */
export function upsertResourceInCache(qc: QueryClient, resource: ResourceDto) {
  resourceCache.accept(qc, resource)
}

export function invalidateResourceLists(qc: QueryClient) {
  if (resourceCache.pending(qc)) return Promise.resolve()
  return Promise.all(
    [
      "resources",
      "projects",
      "overview",
      "tags",
      "search",
      "command-search",
    ].map((family) => qc.invalidateQueries({ queryKey: [family] }))
  ).then(() => undefined)
}

export type CreateResourceBody = {
  url?: string
  text?: string
  type?: ResourceType
  title?: string
  tags?: string[]
  projectIds?: string[]
}

export function useCreateResource() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("resource.create"),
    mutationFn: (body: CreateResourceBody) =>
      api<ResourceDto>("/api/v1/resources", { method: "POST", body }),
    onSuccess: (resource) => {
      upsertResourceInCache(qc, resource)
      return invalidateResourceLists(qc)
    },
  })
}

export function useBulkCreateResources() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("resource.bulk-create"),
    mutationFn: (body: {
      urls: string[]
      tags?: string[]
      projectIds?: string[]
    }) =>
      api<{ created: ResourceDto[]; invalid: string[] }>(
        "/api/v1/resources/bulk",
        { method: "POST", body }
      ),
    onSuccess: ({ created }) => {
      created.forEach((resource) => upsertResourceInCache(qc, resource))
      return invalidateResourceLists(qc)
    },
  })
}

function applyPatch(
  resource: ResourceDto,
  patch: UpdateResourceInput,
  qc: QueryClient
): ResourceDto {
  const next: ResourceDto = { ...resource }
  next.updatedAt = new Date().toISOString()
  if (patch.title !== undefined) next.title = patch.title
  if (patch.notes !== undefined) next.notes = patch.notes
  if (patch.description !== undefined) next.description = patch.description
  if (patch.isFavorite !== undefined) next.isFavorite = patch.isFavorite
  if (patch.isReviewed !== undefined) next.isReviewed = patch.isReviewed
  if (patch.embedStatus !== undefined) next.embedStatus = patch.embedStatus
  if (patch.type !== undefined) next.type = patch.type
  if (patch.bodyJson !== undefined) next.bodyJson = patch.bodyJson
  if (patch.bodyText !== undefined) next.bodyText = patch.bodyText
  if (patch.tags) next.tags = replaceTags(qc, resource.tags, patch.tags)
  if (patch.metadataOverride !== undefined) {
    next.metadataOverride = patch.metadataOverride
    next.metadata = { ...resource.metadata, ...(patch.metadataOverride ?? {}) }
  }
  return next
}

/** PATCH with optimistic update everywhere the resource is cached + rollback. */
export function useUpdateResource() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("resource.update"),
    mutationFn: ({ id, patch }: { id: string; patch: UpdateResourceInput }) =>
      api<ResourceDto>(`/api/v1/resources/${id}`, {
        method: "PATCH",
        body: patch,
      }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: resourceKeys.all })
      return {
        token: resourceCache.begin(qc, id, (current) =>
          current ? applyPatch(current, patch, qc) : current
        ),
      }
    },
    onError: (error, { id }, context) => {
      resourceCache.settle(qc, id, context?.token)
      toast.error(`Couldn't save: ${error.message}`)
    },
    onSuccess: (resource, { id }, context) =>
      resourceCache.settle(qc, id, context?.token, resource),
    onSettled: () => invalidateResourceLists(qc),
  })
}

export function useDeleteResource() {
  const sync = useSyncController()
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("resource.delete"),
    mutationFn: (id: string) =>
      api<null>(`/api/v1/resources/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: resourceKeys.all })
      return { token: resourceCache.begin(qc, id, () => null) }
    },
    onError: (error, id, context) => {
      resourceCache.settle(qc, id, context?.token)
      toast.error(`Couldn't delete: ${error.message}`)
    },
    onSuccess: (_data, id, context) => {
      resourceCache.settle(qc, id, context?.token, null)
      qc.removeQueries({ queryKey: resourceKeys.detail(id) })
      showToast(
        "Moved to trash",
        {
          action: {
            label: "Undo",
            onClick: () => {
              sync
                .track(
                  {
                    label: "Restoring resource",
                    source: "manual",
                    entityKeys: [`resource:${id}`],
                    href: "/trash",
                  },
                  async (saved) => {
                    await api(`/api/v1/trash/resource/${id}/restore`, {
                      method: "POST",
                    })
                    saved()
                    await qc.invalidateQueries(
                      { queryKey: resourceKeys.lists() },
                      { throwOnError: true }
                    )
                  }
                )
                .catch(() =>
                  toast.error("Undo needs attention. Check sync details.")
                )
            },
          },
        },
        "success"
      )
    },
    onSettled: () => invalidateResourceLists(qc),
  })
}

export function useRefreshMetadata() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("resource.refresh"),
    mutationFn: (id: string) =>
      api<ResourceDto>(`/api/v1/resources/${id}/refresh-metadata`, {
        method: "POST",
      }),
    onSuccess: (resource) => {
      upsertResourceInCache(qc, resource)
      toast("Refreshing metadata…")
    },
    onError: (error) => toast.error(error.message),
  })
}

export function useReadme(id: string, enabled: boolean) {
  return useQuery({
    queryKey: resourceKeys.readme(id),
    enabled,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) =>
      api<{ html: string }>(`/api/v1/resources/${id}/readme`, { signal }),
  })
}

export function useTagSearch(q: string) {
  return useQuery({
    queryKey: ["tags", q],
    queryFn: ({ signal }) =>
      api<{ items: TagDto[] }>(
        `/api/v1/tags${toQueryString({ q, limit: 8 })}`,
        { signal }
      ),
    staleTime: 60_000,
    select: (d) => d.items,
  })
}

export type Duplicate = {
  id: string
  type: ResourceType
  url: string | null
  title: string | null
}

export function checkDuplicate(url: string, signal?: AbortSignal) {
  return api<{ duplicate: Duplicate | null }>(
    `/api/v1/resources/check-duplicate${toQueryString({ url })}`,
    { signal }
  ).then((r) => r.duplicate)
}

export function useLoadDemoData() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("resource.demo"),
    mutationFn: () =>
      api<{ count: number }>("/api/v1/demo", { method: "POST" }),
    onSuccess: ({ count }) => {
      toast.success(`Loaded ${count} demo resources`)
      return invalidateResourceLists(qc)
    },
    onError: (error) => toast.error(error.message),
  })
}
