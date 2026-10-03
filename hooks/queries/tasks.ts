"use client"

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"

import { api, toQueryString } from "@/lib/api-client"
import { invalidateResourceLists } from "@/hooks/queries/resources"
import type { TaskDto, TaskPage, TaskPriority, TaskStatus } from "@/lib/tasks/types"
import type {
  CreateTaskInput,
  ListTasksQuery,
  MoveTaskInput,
  SmartFilter,
  UpdateTaskInput,
} from "@/lib/validation/tasks"

export type TaskFilters = {
  smartFilter?: SmartFilter
  projectId?: string
  includeDescendants?: boolean
  tag?: string
  status?: TaskStatus
  priority?: TaskPriority
  includeArchived?: boolean
  sort?: ListTasksQuery["sort"]
  order?: ListTasksQuery["order"]
}

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => ["tasks", "list"] as const,
  list: (filters: TaskFilters) => ["tasks", "list", filters] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
  forResource: (resourceId: string) => ["tasks", "for-resource", resourceId] as const,
}

export function useTaskList(filters: TaskFilters) {
  return useInfiniteQuery({
    queryKey: taskKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<TaskPage>(
        `/api/v1/tasks${toQueryString({
          ...filters,
          includeDescendants: filters.includeDescendants ? "true" : undefined,
          includeArchived: filters.includeArchived ? "true" : undefined,
          cursor: pageParam ?? undefined,
        })}`,
        { signal }
      ),
    getNextPageParam: (last) => last.nextCursor,
  })
}

function findInLists(qc: QueryClient, id: string): TaskDto | undefined {
  for (const [, data] of qc.getQueriesData<InfiniteData<TaskPage>>({ queryKey: taskKeys.lists() })) {
    for (const page of data?.pages ?? []) {
      const found = page.items.find((t) => t.id === id)
      if (found) return found
    }
  }
  return undefined
}

export function useTask(id: string | null) {
  const qc = useQueryClient()
  return useQuery<TaskDto>({
    queryKey: taskKeys.detail(id ?? ""),
    enabled: !!id,
    queryFn: ({ signal }) => api<TaskDto>(`/api/v1/tasks/${id}`, { signal }),
    placeholderData: (): TaskDto | undefined => (id ? findInLists(qc, id) : undefined),
  })
}

/** Writes a task into every cached list and its detail entry. */
export function upsertTaskInCache(qc: QueryClient, task: TaskDto) {
  qc.setQueryData(taskKeys.detail(task.id), task)
  qc.setQueriesData<InfiniteData<TaskPage>>({ queryKey: taskKeys.lists() }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((t) => (t.id === task.id ? task : t)),
          })),
        }
      : data
  )
}

function removeFromLists(qc: QueryClient, id: string) {
  qc.setQueriesData<InfiniteData<TaskPage>>({ queryKey: taskKeys.lists() }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({ ...p, items: p.items.filter((t) => t.id !== id) })),
        }
      : data
  )
}

export function invalidateTaskLists(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["tasks", "smart-counts"] })
  return qc.invalidateQueries({ queryKey: taskKeys.lists() })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      api<TaskDto>("/api/v1/tasks", { method: "POST", body: input }),
    onSuccess: (task) => {
      upsertTaskInCache(qc, task)
      invalidateTaskLists(qc)
      if (task.resources.length) invalidateResourceLists(qc)
    },
    onError: (error) => toast.error(`Couldn't create task: ${error.message}`),
  })
}

function applyPatch(task: TaskDto, patch: UpdateTaskInput): TaskDto {
  const next: TaskDto = { ...task }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.descriptionJson !== undefined) next.descriptionJson = patch.descriptionJson
  if (patch.descriptionText !== undefined) next.descriptionText = patch.descriptionText
  if (patch.status !== undefined) {
    next.status = patch.status
    next.completedAt = patch.status === "done" ? (next.completedAt ?? new Date().toISOString()) : null
  }
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.startAt !== undefined) next.startAt = patch.startAt
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt
  if (patch.startDate !== undefined) next.startDate = patch.startDate
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate
  if (patch.allDay !== undefined) next.allDay = patch.allDay
  if (patch.archived !== undefined) next.archivedAt = patch.archived ? new Date().toISOString() : null
  if (patch.tags) {
    const byName = new Map(task.tags.map((t) => [t.name.toLowerCase(), t]))
    next.tags = patch.tags.map(
      (name) => byName.get(name.toLowerCase()) ?? { id: `tmp-${name}`, name, color: null }
    )
  }
  return next
}

/** PATCH with optimistic update everywhere the task is cached + rollback. */
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      api<TaskDto>(`/api/v1/tasks/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      const previousLists = qc.getQueriesData<InfiniteData<TaskPage>>({ queryKey: taskKeys.lists() })
      const previousDetail = qc.getQueryData<TaskDto>(taskKeys.detail(id))
      const current = previousDetail ?? findInLists(qc, id)
      if (current) upsertTaskInCache(qc, applyPatch(current, patch))
      return { previousLists, previousDetail }
    },
    onError: (error, { id }, context) => {
      context?.previousLists.forEach(([key, data]) => qc.setQueryData(key, data))
      if (context?.previousDetail) qc.setQueryData(taskKeys.detail(id), context.previousDetail)
      toast.error(`Couldn't save: ${error.message}`)
    },
    onSuccess: (task) => upsertTaskInCache(qc, task),
  })
}

export function useMoveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MoveTaskInput }) =>
      api<TaskDto>(`/api/v1/tasks/${id}/move`, { method: "POST", body: input }),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: taskKeys.lists() })
      const previousLists = qc.getQueriesData<InfiniteData<TaskPage>>({ queryKey: taskKeys.lists() })
      const current = findInLists(qc, id)
      if (current) upsertTaskInCache(qc, { ...current, status: input.status })
      return { previousLists }
    },
    onError: (error, _vars, context) => {
      context?.previousLists.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(`Couldn't move: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/api/v1/tasks/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskKeys.lists() })
      const previousLists = qc.getQueriesData<InfiniteData<TaskPage>>({ queryKey: taskKeys.lists() })
      removeFromLists(qc, id)
      return { previousLists }
    },
    onError: (error, _id, context) => {
      context?.previousLists.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(`Couldn't delete: ${error.message}`)
    },
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: taskKeys.detail(id) })
      toast.success("Task deleted")
    },
  })
}

export function useDuplicateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<TaskDto>(`/api/v1/tasks/${id}/duplicate`, { method: "POST" }),
    onSuccess: (task) => {
      upsertTaskInCache(qc, task)
      invalidateTaskLists(qc)
      toast.success("Task duplicated")
    },
    onError: (error) => toast.error(`Couldn't duplicate: ${error.message}`),
  })
}

export function useArchiveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<TaskDto>(`/api/v1/tasks/${id}/archive`, { method: "POST" }),
    onSuccess: (task) => {
      upsertTaskInCache(qc, task)
      invalidateTaskLists(qc)
      toast.success(task.archivedAt ? "Task archived" : "Task unarchived")
    },
    onError: (error) => toast.error(`Couldn't archive: ${error.message}`),
  })
}

export function useLinkTaskResources() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, resourceIds }: { taskId: string; resourceIds: string[] }) =>
      api<{ linked: number }>(`/api/v1/tasks/${taskId}/resources`, {
        method: "POST",
        body: { resourceIds },
      }),
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      invalidateResourceLists(qc)
    },
    onError: (error) => toast.error(`Couldn't link resource: ${error.message}`),
  })
}

export function useUnlinkTaskResources() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, resourceIds }: { taskId: string; resourceIds: string[] }) =>
      api<{ unlinked: number }>(`/api/v1/tasks/${taskId}/resources`, {
        method: "DELETE",
        body: { resourceIds },
      }),
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      invalidateResourceLists(qc)
    },
    onError: (error) => toast.error(`Couldn't unlink resource: ${error.message}`),
  })
}

export function useSmartFilterCounts() {
  return useQuery({
    queryKey: ["tasks", "smart-counts"],
    queryFn: ({ signal }) =>
      api<Record<SmartFilter, number>>("/api/v1/tasks/smart-counts", { signal }),
    staleTime: 10_000,
  })
}

export function useProjectTaskProgress(projectId: string, includeDescendants: boolean) {
  return useQuery({
    queryKey: ["projects", "tasks-progress", projectId, includeDescendants],
    queryFn: ({ signal }) =>
      api<{ done: number; total: number }>(
        `/api/v1/projects/${projectId}/tasks-progress${toQueryString({
          includeDescendants: includeDescendants ? "true" : undefined,
        })}`,
        { signal }
      ),
  })
}

export function useResourceTasks(resourceId: string, enabled = true) {
  return useQuery({
    queryKey: taskKeys.forResource(resourceId),
    enabled,
    queryFn: ({ signal }) =>
      api<{ items: { id: string; title: string; status: TaskStatus; priority: TaskPriority; dueAt: string | null }[] }>(
        `/api/v1/resources/${resourceId}/tasks`,
        { signal }
      ),
    select: (d) => d.items,
  })
}

// ------------------------------------------------------------------ checklist

export function useAddChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, title }: { taskId: string; title: string }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/checklist`, { method: "POST", body: { title } }),
    onSuccess: (task) => upsertTaskInCache(qc, task),
    onError: (error) => toast.error(`Couldn't add item: ${error.message}`),
  })
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      itemId,
      patch,
    }: {
      taskId: string
      itemId: string
      patch: { title?: string; done?: boolean }
    }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/checklist/${itemId}`, {
        method: "PATCH",
        body: patch,
      }),
    onMutate: async ({ taskId, itemId, patch }) => {
      await qc.cancelQueries({ queryKey: taskKeys.detail(taskId) })
      const previous = qc.getQueryData<TaskDto>(taskKeys.detail(taskId))
      if (previous) {
        upsertTaskInCache(qc, {
          ...previous,
          checklist: previous.checklist.map((item) =>
            item.id === itemId ? { ...item, ...patch } : item
          ),
        })
      }
      return { previous }
    },
    onError: (error, { taskId }, context) => {
      if (context?.previous) qc.setQueryData(taskKeys.detail(taskId), context.previous)
      toast.error(`Couldn't update item: ${error.message}`)
    },
    onSuccess: (task) => upsertTaskInCache(qc, task),
  })
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, itemId }: { taskId: string; itemId: string }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/checklist/${itemId}`, { method: "DELETE" }),
    onSuccess: (task) => upsertTaskInCache(qc, task),
    onError: (error) => toast.error(`Couldn't remove item: ${error.message}`),
  })
}

export function useReorderChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      taskId,
      itemId,
      beforeId,
      afterId,
    }: {
      taskId: string
      itemId: string
      beforeId?: string
      afterId?: string
    }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/checklist/${itemId}/move`, {
        method: "POST",
        body: { beforeId, afterId },
      }),
    onSuccess: (task) => upsertTaskInCache(qc, task),
    onError: (error) => toast.error(`Couldn't reorder: ${error.message}`),
  })
}

// ------------------------------------------------------------------ bulk

export type BulkTaskAction =
  | { action: "status"; taskIds: string[]; status: TaskStatus }
  | { action: "priority"; taskIds: string[]; priority: TaskPriority }
  | { action: "project"; taskIds: string[]; projectId: string | null }
  | { action: "tag"; taskIds: string[]; tags: string[] }
  | { action: "untag"; taskIds: string[]; tags: string[] }
  | { action: "delete"; taskIds: string[] }

export function useBulkTaskActions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkTaskAction) =>
      api<{ updated: number }>("/api/v1/tasks/bulk-actions", { method: "POST", body }),
    onSuccess: (_data, vars) => {
      if (vars.action === "delete") {
        vars.taskIds.forEach((id) => qc.removeQueries({ queryKey: taskKeys.detail(id) }))
      } else {
        vars.taskIds.forEach((id) => qc.invalidateQueries({ queryKey: taskKeys.detail(id) }))
      }
      invalidateTaskLists(qc)
      toast.success(vars.action === "delete" ? `Deleted ${vars.taskIds.length} tasks` : "Tasks updated")
    },
    onError: (error) => toast.error(`Couldn't update: ${error.message}`),
  })
}
