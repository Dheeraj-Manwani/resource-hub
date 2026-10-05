"use client"

import {
  beginResources,
  settleResources,
  resourceProjects,
  changeTags,
} from "@/lib/optimistic/actions"
import { resourceCache } from "@/lib/optimistic/domains"
import {
  projectCache,
  projectedTree,
  projectedProject,
} from "@/lib/optimistic/projects"

import { useSyncController } from "@/components/sync-provider"

import { syncMutation } from "@/lib/sync/mutations"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "react-hot-toast"
import { showToast } from "@/lib/toast"

import { api } from "@/lib/api-client"
import {
  invalidateResourceLists,
  upsertResourceInCache,
} from "@/hooks/queries/resources"
import type { ResourceDto } from "@/lib/resources/dto"
import type { ProjectDto } from "@/lib/projects/types"
import type {
  CreateProjectInput,
  MoveProjectInput,
  UpdateProjectInput,
} from "@/lib/validation/projects"

export const projectKeys = {
  all: ["projects"] as const,
  tree: () => ["projects", "tree"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
}

export function useProjectTree() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: projectKeys.tree(),
    queryFn: async ({ signal }) => {
      const data = await api<{ items: ProjectDto[] }>("/api/v1/projects/tree", {
        signal,
      })
      data.items.forEach((item) => projectCache.received(qc, item))
      return data
    },
    select: (d) => projectedTree(qc, d.items),
    staleTime: 10_000,
  })
}

export type ProjectWithAncestors = {
  project: ProjectDto
  ancestors: ProjectDto[]
}

export function useProject(id: string | null) {
  const qc = useQueryClient()
  return useQuery<ProjectWithAncestors>({
    queryKey: projectKeys.detail(id ?? ""),
    enabled: !!id,
    select: (data) => projectedProject(qc, data),
    queryFn: async ({ signal }) => {
      const data = await api<ProjectWithAncestors>(`/api/v1/projects/${id}`, {
        signal,
      })
      projectCache.received(qc, data.project)
      data.ancestors.forEach((item) => projectCache.received(qc, item))
      return data
    },
  })
}

function reconcileProjects(qc: QueryClient) {
  if (projectCache.pending(qc)) return Promise.resolve()
  return Promise.all(
    [
      "projects",
      "resources",
      "tasks",
      "quick-notes",
      "overview",
      "calendar",
      "search",
      "command-search",
    ].map((family) => qc.invalidateQueries({ queryKey: [family] }))
  ).then(() => undefined)
}

function invalidateTree(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: projectKeys.tree() }).catch(() => {})
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.create"),
    mutationFn: (input: CreateProjectInput) =>
      api<ProjectDto>("/api/v1/projects", { method: "POST", body: input }),
    onSuccess: (project) => {
      qc.setQueryData<{ items: ProjectDto[] }>(projectKeys.tree(), (data) => ({
        items: [
          ...(data?.items ?? []).filter((row) => row.id !== project.id),
          project,
        ],
      }))
      toast.success("Project created")
      return invalidateTree(qc)
    },
    onError: (error) =>
      toast.error(`Couldn't create project: ${error.message}`),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.update"),
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProjectInput }) =>
      api<ProjectDto>(`/api/v1/projects/${id}`, {
        method: "PATCH",
        body: patch,
      }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: projectKeys.all })
      return {
        token: projectCache.patch(qc, id, (value) =>
          value
            ? {
                ...value,
                ...patch,
                archivedAt:
                  patch.archived === undefined
                    ? value.archivedAt
                    : patch.archived
                      ? new Date().toISOString()
                      : null,
              }
            : value
        ),
      }
    },
    onSuccess: (project, { id }, context) =>
      projectCache.settle(qc, id, context?.token, project),
    onError: (error, { id }, context) => {
      projectCache.settle(qc, id, context?.token)
      toast.error(`Couldn't save: ${error.message}`)
    },
    onSettled: () => reconcileProjects(qc),
  })
}

export function useMoveProject() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.move"),
    mutationFn: ({ id, input }: { id: string; input: MoveProjectInput }) =>
      api<ProjectDto>(`/api/v1/projects/${id}/move`, {
        method: "POST",
        body: input,
      }),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: projectKeys.all })
      return { token: projectCache.begin(qc, id, input.parentId) }
    },
    onError: (error, { id }, context) => {
      projectCache.settle(qc, id, context?.token)
      toast.error(`Couldn't move: ${error.message}`)
    },
    onSuccess: (project, { id }, context) => {
      projectCache.settle(qc, id, context?.token, project)
      toast.success("Project moved")
    },
    onSettled: () => reconcileProjects(qc),
  })
}

export function useDeleteProject() {
  const sync = useSyncController()
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.delete"),
    mutationFn: ({ id, mode }: { id: string; mode: "subtree" | "reparent" }) =>
      api<null>(`/api/v1/projects/${id}?mode=${mode}`, { method: "DELETE" }),
    onSuccess: (_data, { id, mode }) => {
      invalidateTree(qc)
      invalidateResourceLists(qc)
      if (mode === "reparent") {
        showToast(
          "Project deleted",
          {
            action: {
              label: "Undo",
              onClick: () => {
                sync
                  .track(
                    {
                      label: "Restoring project",
                      source: "manual",
                      entityKeys: [`project:${id}`],
                      href: "/trash",
                    },
                    async (saved) => {
                      await api(`/api/v1/trash/project/${id}/restore`, {
                        method: "POST",
                      })
                      saved()
                      await qc.invalidateQueries(
                        { queryKey: projectKeys.tree() },
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
      } else {
        showToast(
          "Project and its sub-projects deleted",
          {
            description: "Restore each one from Trash if you change your mind.",
          },
          "success"
        )
      }
    },
    onError: (error) => toast.error(`Couldn't delete: ${error.message}`),
  })
}

function mergeResources(qc: QueryClient, items: ResourceDto[]) {
  items.forEach((r) => upsertResourceInCache(qc, r))
  invalidateResourceLists(qc)
  invalidateTree(qc) // counts changed
}

export function useLinkResources() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.link"),
    mutationFn: ({
      projectId,
      resourceIds,
    }: {
      projectId: string
      resourceIds: string[]
    }) =>
      api<{ linked: number }>(`/api/v1/projects/${projectId}/resources`, {
        method: "POST",
        body: { resourceIds },
      }),
    onMutate: async ({ projectId, resourceIds }) => {
      await qc.cancelQueries({ queryKey: ["resources"] })
      return {
        tokens: beginResources(qc, resourceIds, (resource) =>
          resourceProjects(qc, resource, null, projectId)
        ),
      }
    },
    onSuccess: (_data, { resourceIds }, context) => {
      settleResources(qc, context?.tokens, "commit")
      invalidateResourceLists(qc)
      invalidateTree(qc)
      resourceIds.forEach((id) =>
        qc.invalidateQueries({ queryKey: ["resources", "detail", id] })
      )
    },
    onError: (error, _vars, context) => {
      settleResources(qc, context?.tokens, "rollback")
      toast.error(`Couldn't update resources: ${error.message}`)
    },
    onSettled: () => {
      if (!resourceCache.pending(qc))
        return Promise.all([
          invalidateResourceLists(qc),
          invalidateTree(qc),
        ]).then(() => undefined)
    },
  })
}

export function useUnlinkResources() {
  const sync = useSyncController()
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.unlink"),
    mutationFn: ({
      projectId,
      resourceIds,
    }: {
      projectId: string
      resourceIds: string[]
    }) =>
      api<{ unlinked: number }>(`/api/v1/projects/${projectId}/resources`, {
        method: "DELETE",
        body: { resourceIds },
      }),
    onMutate: async ({ projectId, resourceIds }) => {
      await qc.cancelQueries({ queryKey: ["resources"] })
      return {
        tokens: beginResources(qc, resourceIds, (resource) =>
          resourceProjects(qc, resource, projectId, null)
        ),
      }
    },
    onSuccess: (_data, { projectId, resourceIds }, context) => {
      settleResources(qc, context?.tokens, "commit")
      invalidateResourceLists(qc)
      invalidateTree(qc)
      resourceIds.forEach((id) =>
        qc.invalidateQueries({ queryKey: ["resources", "detail", id] })
      )
      showToast("Removed from project", {
        action: {
          label: "Undo",
          onClick: () => {
            sync
              .track(
                {
                  label: "Restoring project resources",
                  source: "manual",
                  entityKeys: [
                    `project:${projectId}`,
                    ...resourceIds.map((id) => `resource:${id}`),
                  ],
                  href: `/projects/${projectId}`,
                },
                async (saved) => {
                  await api(`/api/v1/projects/${projectId}/resources`, {
                    method: "POST",
                    body: { resourceIds },
                  })
                  saved()
                  await Promise.all([
                    qc.invalidateQueries(
                      { queryKey: ["resources"] },
                      { throwOnError: true }
                    ),
                    qc.invalidateQueries(
                      { queryKey: projectKeys.tree() },
                      { throwOnError: true }
                    ),
                  ])
                }
              )
              .catch(() =>
                toast.error("Undo needs attention. Check sync details.")
              )
          },
        },
      })
    },
    onError: (error, _vars, context) => {
      settleResources(qc, context?.tokens, "rollback")
      toast.error(`Couldn't update resources: ${error.message}`)
    },
    onSettled: () => {
      if (!resourceCache.pending(qc))
        return Promise.all([
          invalidateResourceLists(qc),
          invalidateTree(qc),
        ]).then(() => undefined)
    },
  })
}

export function useMoveResources() {
  const sync = useSyncController()
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.move-resources"),
    mutationFn: ({
      resourceIds,
      from,
      to,
    }: {
      resourceIds: string[]
      from: string | null
      to: string | null
    }) =>
      api<{ items: ResourceDto[] }>("/api/v1/resources/move", {
        method: "POST",
        body: { resourceIds, from, to },
      }),
    onMutate: async ({ resourceIds, from, to }) => {
      await qc.cancelQueries({ queryKey: ["resources"] })
      return {
        tokens: beginResources(qc, resourceIds, (resource) =>
          resourceProjects(qc, resource, from, to)
        ),
      }
    },
    onSuccess: ({ items }, { resourceIds, from, to }, context) => {
      settleResources(qc, context?.tokens, items)
      mergeResources(qc, items)
      showToast("Moved", {
        action: {
          label: "Undo",
          onClick: () => {
            sync
              .track(
                {
                  label: "Undoing resource move",
                  source: "manual",
                  entityKeys: resourceIds.map((id) => `resource:${id}`),
                  href: "/resources",
                },
                async (saved) => {
                  const { items: undone } = await api<{ items: ResourceDto[] }>(
                    "/api/v1/resources/move",
                    {
                      method: "POST",
                      body: { resourceIds, from: to, to: from },
                    }
                  )
                  saved()
                  mergeResources(qc, undone)
                  await Promise.all([
                    qc.invalidateQueries(
                      { queryKey: ["resources"] },
                      { throwOnError: true, cancelRefetch: false }
                    ),
                    qc.invalidateQueries(
                      { queryKey: projectKeys.tree() },
                      { throwOnError: true, cancelRefetch: false }
                    ),
                  ])
                }
              )
              .catch(() =>
                toast.error("Undo needs attention. Check sync details.")
              )
          },
        },
      })
    },
    onError: (error, _vars, context) => {
      settleResources(qc, context?.tokens, "rollback")
      toast.error(`Couldn't update resources: ${error.message}`)
    },
    onSettled: () => {
      if (!resourceCache.pending(qc))
        return Promise.all([
          invalidateResourceLists(qc),
          invalidateTree(qc),
        ]).then(() => undefined)
    },
  })
}

export type BulkAction =
  | { action: "link"; resourceIds: string[]; projectId: string }
  | { action: "unlink"; resourceIds: string[]; projectId: string }
  | {
      action: "move"
      resourceIds: string[]
      from: string | null
      to: string | null
    }
  | { action: "tag"; resourceIds: string[]; tags: string[] }
  | { action: "untag"; resourceIds: string[]; tags: string[] }
  | { action: "favorite"; resourceIds: string[]; value: boolean }
  | { action: "delete"; resourceIds: string[] }

export function useBulkResourceActions() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("project.bulk-resources"),
    mutationFn: (body: BulkAction) =>
      api<{ items: ResourceDto[] }>("/api/v1/resources/bulk-actions", {
        method: "POST",
        body,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["resources"] })
      return {
        tokens: beginResources(qc, vars.resourceIds, (resource) =>
          vars.action === "delete"
            ? null
            : vars.action === "favorite"
              ? { ...resource, isFavorite: vars.value }
              : vars.action === "tag" || vars.action === "untag"
                ? {
                    ...resource,
                    tags: changeTags(
                      qc,
                      resource.tags,
                      vars.tags,
                      vars.action === "tag"
                    ),
                  }
                : vars.action === "move"
                  ? resourceProjects(qc, resource, vars.from, vars.to)
                  : resourceProjects(
                      qc,
                      resource,
                      vars.action === "unlink" ? vars.projectId : null,
                      vars.action === "link" ? vars.projectId : null
                    )
        ),
      }
    },
    onSuccess: ({ items }, vars, context) => {
      settleResources(
        qc,
        context?.tokens,
        vars.action === "delete" ? "delete" : items
      )
      if (vars.action === "delete") {
        vars.resourceIds.forEach((id) =>
          qc.removeQueries({ queryKey: ["resources", "detail", id] })
        )
        invalidateResourceLists(qc)
        invalidateTree(qc)
        toast.success(`Moved ${vars.resourceIds.length} to trash`)
        return
      }
      mergeResources(qc, items)
      const label =
        vars.action === "link"
          ? "Added to project"
          : vars.action === "unlink"
            ? "Removed from project"
            : vars.action === "favorite"
              ? vars.value
                ? "Added to favorites"
                : "Removed from favorites"
              : vars.action === "tag"
                ? "Tags added"
                : vars.action === "untag"
                  ? "Tags removed"
                  : "Moved"
      toast.success(label)
    },
    onError: (error, _vars, context) => {
      settleResources(qc, context?.tokens, "rollback")
      toast.error(`Couldn't update resources: ${error.message}`)
    },
    onSettled: () => {
      if (!resourceCache.pending(qc))
        return Promise.all([
          invalidateResourceLists(qc),
          invalidateTree(qc),
        ]).then(() => undefined)
    },
  })
}
