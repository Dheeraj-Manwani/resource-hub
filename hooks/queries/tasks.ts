"use client"

import {
  beginTasks,
  settleTasks,
  taskResources,
  changeTags,
  replaceTags,
  reorderChecklist,
  pendingChecklistId,
} from "@/lib/optimistic/actions"
import { taskCache } from "@/lib/optimistic/domains"
import { generateKeyBetween } from "fractional-indexing"

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
import { invalidateResourceLists } from "@/hooks/queries/resources"
import type {
  TaskDto,
  TaskPage,
  TaskPriority,
  TaskStatus,
} from "@/lib/tasks/types"
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
  forResource: (resourceId: string) =>
    ["tasks", "for-resource", resourceId] as const,
}

export function useTaskList(filters: TaskFilters) {
  const qc = useQueryClient()
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
      ).then((page) => {
        page.items.forEach((item) => taskCache.received(qc, item))
        return page
      }),
    getNextPageParam: (last) => last.nextCursor,
    select: (data) => taskCache.projectList(qc, data, filters),
  })
}

function findInLists(qc: QueryClient, id: string): TaskDto | undefined {
  for (const [, data] of qc.getQueriesData<InfiniteData<TaskPage>>({
    queryKey: taskKeys.lists(),
  })) {
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
    queryFn: ({ signal }) =>
      api<TaskDto>(`/api/v1/tasks/${id}`, { signal }).then((value) =>
        taskCache.received(qc, value)
      ),
    placeholderData: (): TaskDto | undefined =>
      id ? findInLists(qc, id) : undefined,
  })
}

/** Writes a task into every cached list and its detail entry. */
export function upsertTaskInCache(qc: QueryClient, task: TaskDto) {
  taskCache.accept(qc, task)
}

export function invalidateTaskLists(qc: QueryClient) {
  if (taskCache.pending(qc)) return Promise.resolve()
  return Promise.all(
    [
      "tasks",
      "calendar",
      "projects",
      "overview",
      "resources",
      "tags",
      "search",
      "command-search",
      "reminders",
    ].map((family) => qc.invalidateQueries({ queryKey: [family] }))
  ).then(() => undefined)
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.create"),
    mutationFn: (input: CreateTaskInput) =>
      api<TaskDto>("/api/v1/tasks", { method: "POST", body: input }),
    onSuccess: (task) => {
      upsertTaskInCache(qc, task)
      invalidateTaskLists(qc)
      if (task.resources.length) invalidateResourceLists(qc)
      toast.success("Task created")
    },
    onError: (error) => toast.error(`Couldn't create task: ${error.message}`),
  })
}

export function applyPatch(
  task: TaskDto,
  patch: UpdateTaskInput,
  qc: QueryClient
): TaskDto {
  const next: TaskDto = { ...task }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.descriptionJson !== undefined)
    next.descriptionJson = patch.descriptionJson
  if (patch.descriptionText !== undefined)
    next.descriptionText = patch.descriptionText
  if (patch.status !== undefined) {
    next.status = patch.status
    next.completedAt =
      patch.status === "done"
        ? (next.completedAt ?? new Date().toISOString())
        : null
  }
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.startAt !== undefined) next.startAt = patch.startAt
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt
  if (patch.startDate !== undefined) next.startDate = patch.startDate
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate
  if (patch.allDay !== undefined) next.allDay = patch.allDay
  if (patch.rrule !== undefined) next.rrule = patch.rrule
  if (patch.projectId !== undefined) {
    next.projectId = patch.projectId
    const project = qc
      .getQueryData<{
        items: {
          id: string
          name: string
          icon: string | null
          color: string | null
        }[]
      }>(["projects", "tree"])
      ?.items.find((item) => item.id === patch.projectId)
    next.project = project
      ? {
          id: project.id,
          name: project.name,
          icon: project.icon,
          color: project.color,
        }
      : null
  }
  next.updatedAt = new Date().toISOString()
  if (patch.archived !== undefined)
    next.archivedAt = patch.archived ? new Date().toISOString() : null
  if (patch.tags) next.tags = replaceTags(qc, task.tags, patch.tags)
  return next
}

function optimisticMove(qc: QueryClient, task: TaskDto, input: MoveTaskInput) {
  const next = applyPatch(task, { status: input.status }, qc)
  const neighbor = input.beforeId
    ? taskCache.read(qc, input.beforeId)
    : input.afterId
      ? taskCache.read(qc, input.afterId)
      : null
  if (neighbor?.status === input.status) {
    const siblings = [
      ...new Map(
        qc
          .getQueriesData<InfiniteData<TaskPage>>({
            queryKey: taskKeys.lists(),
          })
          .flatMap(
            ([, data]) => data?.pages.flatMap((page) => page.items) ?? []
          )
          .filter((item) => item.id !== task.id && item.status === input.status)
          .map((item) => [item.id, item])
      ).values(),
    ].sort((a, b) =>
      a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
    )
    const index = siblings.findIndex((item) => item.id === neighbor.id)
    if (index >= 0) {
      const lower = input.beforeId
        ? (siblings[index - 1]?.sortKey ?? null)
        : neighbor.sortKey
      const upper = input.beforeId
        ? neighbor.sortKey
        : (siblings[index + 1]?.sortKey ?? null)
      if (lower === null || upper === null || lower < upper)
        next.sortKey = generateKeyBetween(lower, upper)
    }
  }
  return next
}

/** PATCH with optimistic update everywhere the task is cached + rollback. */
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.update"),
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      api<TaskDto>(`/api/v1/tasks/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        token: taskCache.begin(qc, id, (current) =>
          current ? applyPatch(current, patch, qc) : current
        ),
      }
    },
    onError: (error, { id }, context) => {
      taskCache.settle(qc, id, context?.token)
      toast.error(`Couldn't save: ${error.message}`)
    },
    onSuccess: (task, { id }, context) =>
      taskCache.settle(qc, id, context?.token, task),
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useMoveTask() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.move"),
    mutationFn: ({ id, input }: { id: string; input: MoveTaskInput }) =>
      api<TaskDto>(`/api/v1/tasks/${id}/move`, { method: "POST", body: input }),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        token: taskCache.begin(qc, id, (current) =>
          current ? optimisticMove(qc, current, input) : current
        ),
      }
    },
    onError: (error, { id }, context) => {
      taskCache.settle(qc, id, context?.token)
      toast.error(`Couldn't move: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
    onSuccess: (task, { id }, context) =>
      taskCache.settle(qc, id, context?.token, task),
  })
}

export function useDeleteTask() {
  const sync = useSyncController()
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.delete"),
    mutationFn: (id: string) =>
      api<null>(`/api/v1/tasks/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return { token: taskCache.begin(qc, id, () => null) }
    },
    onError: (error, id, context) => {
      taskCache.settle(qc, id, context?.token)
      toast.error(`Couldn't delete: ${error.message}`)
    },
    onSuccess: (_data, id, context) => {
      taskCache.settle(qc, id, context?.token, null)
      qc.removeQueries({ queryKey: taskKeys.detail(id) })
      showToast(
        "Task deleted",
        {
          action: {
            label: "Undo",
            onClick: () => {
              sync
                .track(
                  {
                    label: "Restoring task",
                    source: "manual",
                    entityKeys: [`task:${id}`],
                    href: "/trash",
                  },
                  async (saved) => {
                    await api(`/api/v1/trash/task/${id}/restore`, {
                      method: "POST",
                    })
                    saved()
                    await qc.invalidateQueries(
                      { queryKey: taskKeys.lists() },
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
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useDuplicateTask() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.duplicate"),
    mutationFn: (id: string) =>
      api<TaskDto>(`/api/v1/tasks/${id}/duplicate`, { method: "POST" }),
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
    ...syncMutation("task.archive"),
    mutationFn: (id: string) =>
      api<TaskDto>(`/api/v1/tasks/${id}/archive`, { method: "POST" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        token: taskCache.begin(qc, id, (task) =>
          task ? applyPatch(task, { archived: !task.archivedAt }, qc) : task
        ),
      }
    },
    onSuccess: (task, id, context) => {
      taskCache.settle(qc, id, context?.token, task)
      toast.success(task.archivedAt ? "Task archived" : "Task unarchived")
    },
    onError: (error, id, context) => {
      taskCache.settle(qc, id, context?.token)
      toast.error(`Couldn't archive: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useLinkTaskResources() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.link"),
    mutationFn: ({
      taskId,
      resourceIds,
    }: {
      taskId: string
      resourceIds: string[]
    }) =>
      api<{ linked: number }>(`/api/v1/tasks/${taskId}/resources`, {
        method: "POST",
        body: { resourceIds },
      }),
    onMutate: async ({ taskId, resourceIds }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        token: taskCache.begin(qc, taskId, (task) =>
          task ? taskResources(qc, task, resourceIds, true) : task
        ),
      }
    },
    onSuccess: (_data, { taskId }, context) => {
      taskCache.commit(qc, taskId, context?.token)
      qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      invalidateResourceLists(qc)
    },
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      toast.error(`Couldn't change resource links: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useUnlinkTaskResources() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.unlink"),
    mutationFn: ({
      taskId,
      resourceIds,
    }: {
      taskId: string
      resourceIds: string[]
    }) =>
      api<{ unlinked: number }>(`/api/v1/tasks/${taskId}/resources`, {
        method: "DELETE",
        body: { resourceIds },
      }),
    onMutate: async ({ taskId, resourceIds }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        token: taskCache.begin(qc, taskId, (task) =>
          task ? taskResources(qc, task, resourceIds, false) : task
        ),
      }
    },
    onSuccess: (_data, { taskId }, context) => {
      taskCache.commit(qc, taskId, context?.token)
      qc.invalidateQueries({ queryKey: taskKeys.detail(taskId) })
      invalidateResourceLists(qc)
    },
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      toast.error(`Couldn't change resource links: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useSmartFilterCounts() {
  return useQuery({
    queryKey: ["tasks", "smart-counts"],
    queryFn: ({ signal }) =>
      api<Record<SmartFilter, number>>("/api/v1/tasks/smart-counts", {
        signal,
      }),
    staleTime: 10_000,
  })
}

export function useProjectTaskProgress(
  projectId: string,
  includeDescendants: boolean
) {
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
      api<{
        items: {
          id: string
          title: string
          status: TaskStatus
          priority: TaskPriority
          dueAt: string | null
        }[]
      }>(`/api/v1/resources/${resourceId}/tasks`, { signal }),
    select: (d) => d.items,
  })
}

// ------------------------------------------------------------------ checklist

export function useAddChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.checklist-add"),
    mutationFn: ({ taskId, title }: { taskId: string; title: string }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/checklist`, {
        method: "POST",
        body: { title },
      }),
    onMutate: async ({ taskId, title }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      const pendingId = pendingChecklistId()
      return {
        token: taskCache.begin(qc, taskId, (task) =>
          task
            ? {
                ...task,
                checklist: [
                  ...task.checklist,
                  {
                    id: pendingId,
                    title,
                    done: false,
                    sortKey: generateKeyBetween(
                      task.checklist.at(-1)?.sortKey ?? null,
                      null
                    ),
                  },
                ],
              }
            : task
        ),
      }
    },
    onSuccess: (task, { taskId }, context) =>
      taskCache.settle(qc, taskId, context?.token, task),
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      toast.error(`Couldn't add item: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.checklist-update"),
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
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        token: taskCache.begin(qc, taskId, (current) =>
          current
            ? {
                ...current,
                checklist: current.checklist.map((item) =>
                  item.id === itemId ? { ...item, ...patch } : item
                ),
              }
            : current
        ),
      }
    },
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      toast.error(`Couldn't update item: ${error.message}`)
    },
    onSuccess: (task, { taskId }, context) =>
      taskCache.settle(qc, taskId, context?.token, task),
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.checklist-delete"),
    mutationFn: ({ taskId, itemId }: { taskId: string; itemId: string }) =>
      api<TaskDto>(`/api/v1/tasks/${taskId}/checklist/${itemId}`, {
        method: "DELETE",
      }),
    onMutate: async ({ taskId, itemId }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })

      return {
        token: taskCache.begin(qc, taskId, (task) =>
          task
            ? {
                ...task,
                checklist: task.checklist.filter((item) => item.id !== itemId),
              }
            : task
        ),
      }
    },
    onSuccess: (task, { taskId }, context) =>
      taskCache.settle(qc, taskId, context?.token, task),
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      toast.error(`Couldn't remove item: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
  })
}

export function useReorderChecklistItem() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("task.checklist-move"),
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
    onMutate: async ({ taskId, itemId, beforeId, afterId }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })

      return {
        token: taskCache.begin(qc, taskId, (task) =>
          task
            ? {
                ...task,
                checklist: reorderChecklist(
                  task.checklist,
                  itemId,
                  beforeId,
                  afterId
                ),
              }
            : task
        ),
      }
    },
    onSuccess: (task, { taskId }, context) =>
      taskCache.settle(qc, taskId, context?.token, task),
    onError: (error, { taskId }, context) => {
      taskCache.settle(qc, taskId, context?.token)
      toast.error(`Couldn't reorder: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
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
    ...syncMutation("task.bulk"),
    mutationFn: (body: BulkTaskAction) =>
      api<{ updated: number }>("/api/v1/tasks/bulk-actions", {
        method: "POST",
        body,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: taskKeys.all })
      return {
        tokens: beginTasks(qc, vars.taskIds, (task) =>
          vars.action === "delete"
            ? null
            : vars.action === "tag" || vars.action === "untag"
              ? {
                  ...task,
                  tags: changeTags(
                    qc,
                    task.tags,
                    vars.tags,
                    vars.action === "tag"
                  ),
                }
              : applyPatch(
                  task,
                  vars.action === "status"
                    ? { status: vars.status }
                    : vars.action === "priority"
                      ? { priority: vars.priority }
                      : { projectId: vars.projectId },
                  qc
                )
        ),
      }
    },
    onSuccess: (_data, vars, context) => {
      settleTasks(qc, context?.tokens, true)
      if (vars.action === "delete") {
        vars.taskIds.forEach((id) =>
          qc.removeQueries({ queryKey: taskKeys.detail(id) })
        )
      } else {
        vars.taskIds.forEach((id) =>
          qc.invalidateQueries({ queryKey: taskKeys.detail(id) })
        )
      }
      invalidateTaskLists(qc)
      toast.success(
        vars.action === "delete"
          ? `Deleted ${vars.taskIds.length} tasks`
          : "Tasks updated"
      )
    },
    onError: (error, _vars, context) => {
      settleTasks(qc, context?.tokens, false)
      toast.error(`Couldn't update: ${error.message}`)
    },
    onSettled: () => invalidateTaskLists(qc),
  })
}
