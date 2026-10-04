"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "react-hot-toast"
import { showToast } from "@/lib/toast"

import { api } from "@/lib/api-client"
import { invalidateResourceLists, upsertResourceInCache } from "@/hooks/queries/resources"
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
  return useQuery({
    queryKey: projectKeys.tree(),
    queryFn: ({ signal }) =>
      api<{ items: ProjectDto[] }>("/api/v1/projects/tree", { signal }),
    select: (d) => d.items,
    staleTime: 10_000,
  })
}

export type ProjectWithAncestors = {
  project: ProjectDto
  ancestors: ProjectDto[]
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ""),
    enabled: !!id,
    queryFn: ({ signal }) =>
      api<ProjectWithAncestors>(`/api/v1/projects/${id}`, { signal }),
  })
}

function invalidateTree(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: projectKeys.tree() }).catch(() => {})
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api<ProjectDto>("/api/v1/projects", { method: "POST", body: input }),
    onSuccess: () => {
      toast.success("Project created")
      return invalidateTree(qc)
    },
    onError: (error) => toast.error(`Couldn't create project: ${error.message}`),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProjectInput }) =>
      api<ProjectDto>(`/api/v1/projects/${id}`, {
        method: "PATCH",
        body: patch,
      }),
    onSuccess: (project) => {
      invalidateTree(qc)
      qc.setQueryData(projectKeys.detail(project.id), (prev: ProjectWithAncestors | undefined) =>
        prev ? { ...prev, project } : prev
      )
    },
    onError: (error) => toast.error(`Couldn't save: ${error.message}`),
  })
}

export function useMoveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: MoveProjectInput
    }) =>
      api<ProjectDto>(`/api/v1/projects/${id}/move`, {
        method: "POST",
        body: input,
      }),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: projectKeys.tree() })
      const previous = qc.getQueryData<{ items: ProjectDto[] }>(
        projectKeys.tree()
      )
      if (previous) {
        qc.setQueryData(projectKeys.tree(), {
          items: previous.items.map((p) =>
            p.id === id ? { ...p, parentId: input.parentId } : p
          ),
        })
      }
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(projectKeys.tree(), context.previous)
      toast.error(`Couldn't move: ${error.message}`)
    },
    onSuccess: () => toast.success("Project moved"),
    onSettled: () => invalidateTree(qc),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      mode,
    }: {
      id: string
      mode: "subtree" | "reparent"
    }) =>
      api<null>(`/api/v1/projects/${id}?mode=${mode}`, { method: "DELETE" }),
    onSuccess: (_data, { id, mode }) => {
      invalidateTree(qc)
      invalidateResourceLists(qc)
      if (mode === "reparent") {
        showToast("Project deleted", {
          action: {
            label: "Undo",
            onClick: () => {
              api(`/api/v1/trash/project/${id}/restore`, { method: "POST" })
                .then(() => invalidateTree(qc))
                .catch(() => toast.error("Couldn't undo"))
            },
          },
        }, "success")
      } else {
        showToast("Project and its sub-projects deleted", {
          description: "Restore each one from Trash if you change your mind.",
        }, "success")
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
    onSuccess: (_data, { resourceIds }) => {
      invalidateResourceLists(qc)
      invalidateTree(qc)
      resourceIds.forEach((id) =>
        qc.invalidateQueries({ queryKey: ["resources", "detail", id] })
      )
    },
    onError: (error) => toast.error(`Couldn't add to project: ${error.message}`),
  })
}

export function useUnlinkResources() {
  const qc = useQueryClient()
  return useMutation({
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
    onSuccess: (_data, { projectId, resourceIds }) => {
      invalidateResourceLists(qc)
      invalidateTree(qc)
      resourceIds.forEach((id) =>
        qc.invalidateQueries({ queryKey: ["resources", "detail", id] })
      )
      showToast("Removed from project", {
        action: {
          label: "Undo",
          onClick: () => {
            api(`/api/v1/projects/${projectId}/resources`, {
              method: "POST",
              body: { resourceIds },
            })
              .then(() => {
                invalidateResourceLists(qc)
                invalidateTree(qc)
              })
              .catch(() => toast.error("Couldn't undo"))
          },
        },
      })
    },
    onError: (error) => toast.error(`Couldn't remove: ${error.message}`),
  })
}

export function useMoveResources() {
  const qc = useQueryClient()
  return useMutation({
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
    onSuccess: ({ items }, { resourceIds, from, to }) => {
      mergeResources(qc, items)
      showToast("Moved", {
        action: {
          label: "Undo",
          onClick: () => {
            api<{ items: ResourceDto[] }>("/api/v1/resources/move", {
              method: "POST",
              body: { resourceIds, from: to, to: from },
            })
              .then(({ items: undone }) => mergeResources(qc, undone))
              .catch(() => toast.error("Couldn't undo"))
          },
        },
      })
    },
    onError: (error) => toast.error(`Couldn't move: ${error.message}`),
  })
}

export type BulkAction =
  | { action: "link"; resourceIds: string[]; projectId: string }
  | { action: "unlink"; resourceIds: string[]; projectId: string }
  | { action: "move"; resourceIds: string[]; from: string | null; to: string | null }
  | { action: "tag"; resourceIds: string[]; tags: string[] }
  | { action: "untag"; resourceIds: string[]; tags: string[] }
  | { action: "favorite"; resourceIds: string[]; value: boolean }
  | { action: "delete"; resourceIds: string[] }

export function useBulkResourceActions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkAction) =>
      api<{ items: ResourceDto[] }>("/api/v1/resources/bulk-actions", {
        method: "POST",
        body,
      }),
    onSuccess: ({ items }, vars) => {
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
    onError: (error) => toast.error(`Couldn't update: ${error.message}`),
  })
}
