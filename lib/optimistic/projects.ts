import type { QueryClient } from "@tanstack/react-query"
import type { ProjectDto } from "@/lib/projects/types"
import type { ProjectWithAncestors } from "@/hooks/queries/projects"
import { refreshReferences } from "./references"
import { journalFor } from "./journal"

const journal = (client: QueryClient) =>
  journalFor<ProjectDto>(client, "project")
export function projectedTree(client: QueryClient, items: ProjectDto[]) {
  return items
    .map((item) => journal(client).project(item.id, item) ?? item)
    .sort((a, b) =>
      a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
    )
}
export function projectedProject(
  client: QueryClient,
  detail: ProjectWithAncestors
): ProjectWithAncestors {
  const project =
    journal(client).project(detail.project.id, detail.project) ?? detail.project
  const tree = client.getQueryData<{ items: ProjectDto[] }>([
    "projects",
    "tree",
  ])
  if (!tree) return { ...detail, project }
  const items = projectedTree(client, tree.items)
  const ancestors: ProjectDto[] = []
  const visited = new Set([project.id])
  let parent = project.parentId
  while (parent && !visited.has(parent)) {
    visited.add(parent)
    const value = items.find((item) => item.id === parent)
    if (!value) return { ...detail, project }
    ancestors.unshift(value)
    parent = value.parentId
  }
  return { project, ancestors }
}
export function writeProject(client: QueryClient, id: string) {
  return (project: ProjectDto | null) => {
    if (!project) return
    client.setQueryData<{ items: ProjectDto[] }>(
      ["projects", "tree"],
      (data) =>
        data
          ? {
              ...data,
              items: data.items.map((item) =>
                item.id === id ? project : item
              ),
            }
          : data
    )
    refreshReferences(client)
    for (const query of client
      .getQueryCache()
      .findAll({ queryKey: ["projects", "detail"] })) {
      client.setQueryData<ProjectWithAncestors>(query.queryKey, (data) =>
        data
          ? projectedProject(client, {
              ...data,
              project: data.project.id === id ? project : data.project,
            })
          : data
      )
    }
  }
}
export const projectCache = {
  patch: (
    client: QueryClient,
    id: string,
    apply: (value: ProjectDto | null) => ProjectDto | null
  ) =>
    journal(client).begin(
      id,
      client
        .getQueryData<{ items: ProjectDto[] }>(["projects", "tree"])
        ?.items.find((item) => item.id === id) ??
        client.getQueryData<ProjectWithAncestors>(["projects", "detail", id])
          ?.project ??
        null,
      apply,
      writeProject(client, id)
    ),
  received: (client: QueryClient, value: ProjectDto) =>
    journal(client).rebase(value.id, value),
  begin: (client: QueryClient, id: string, parentId: string | null) => {
    const base =
      client
        .getQueryData<{ items: ProjectDto[] }>(["projects", "tree"])
        ?.items.find((item) => item.id === id) ??
      client.getQueryData<ProjectWithAncestors>(["projects", "detail", id])
        ?.project ??
      null
    return journal(client).begin(
      id,
      base,
      (value) => (value ? { ...value, parentId } : value),
      writeProject(client, id)
    )
  },
  settle: (
    client: QueryClient,
    id: string,
    token?: string,
    server?: ProjectDto
  ) => journal(client).settle(id, token, server),
  accept: (client: QueryClient, value: ProjectDto) =>
    journal(client).accept(value.id, value, writeProject(client, value.id)),
  pending: (client: QueryClient) => journal(client).has(),
}
