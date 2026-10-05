import type { QueryClient } from "@tanstack/react-query"
import type { ProjectDto } from "@/lib/projects/types"
import type { TagDto, ResourceDto } from "@/lib/resources/dto"
import type { TaskDto } from "@/lib/tasks/types"

function tag(client: QueryClient, value: TagDto): TagDto {
  const canonical = client
    .getQueryData<{ items: TagDto[] }>(["tags", "with-counts"])
    ?.items.find((item) => item.id === value.id)
  return canonical &&
    (value.name !== canonical.name || value.color !== canonical.color)
    ? { ...value, name: canonical.name, color: canonical.color }
    : value
}
function project<
  T extends {
    id: string
    name: string
    icon: string | null
    color: string | null
  },
>(client: QueryClient, value: T): T {
  const canonical = client
    .getQueryData<{ items: ProjectDto[] }>(["projects", "tree"])
    ?.items.find((item) => item.id === value.id)
  return canonical &&
    (value.name !== canonical.name ||
      value.icon !== canonical.icon ||
      value.color !== canonical.color)
    ? {
        ...value,
        name: canonical.name,
        icon: canonical.icon,
        color: canonical.color,
      }
    : value
}
function mapShared<T>(items: T[], transform: (item: T) => T): T[] {
  const next = items.map(transform)
  return next.every((item, index) => item === items[index]) ? items : next
}
export function taskReferences(client: QueryClient, value: TaskDto): TaskDto {
  const tags = mapShared(value.tags, (item) => tag(client, item))
  const chip = value.project ? project(client, value.project) : null
  return tags === value.tags && chip === value.project
    ? value
    : { ...value, tags, project: chip }
}
export function resourceReferences(
  client: QueryClient,
  value: ResourceDto
): ResourceDto {
  const tags = mapShared(value.tags, (item) => tag(client, item))
  const projects = mapShared(value.projects, (item) => project(client, item))
  return tags === value.tags && projects === value.projects
    ? value
    : { ...value, tags, projects }
}
export function refreshReferences(client: QueryClient) {
  function visit(data: unknown): unknown {
    if (Array.isArray(data)) return mapShared(data, visit)
    if (!data || typeof data !== "object") return data
    const row = data as Record<string, unknown>
    const next: Record<string, unknown> = { ...row }
    for (const [key, value] of Object.entries(row)) {
      if (key === "tags" && Array.isArray(value))
        next[key] = mapShared(value, (item: TagDto) => tag(client, item))
      else if (key === "projects" && Array.isArray(value))
        next[key] = mapShared(value, (item) =>
          item?.id && item.name ? project(client, item) : visit(item)
        )
      else if (
        key === "project" &&
        value &&
        typeof value === "object" &&
        "id" in value &&
        "name" in value
      )
        next[key] = project(client, value as ProjectDto)
      else if (
        ![
          "bodyJson",
          "descriptionJson",
          "metadata",
          "metadataOverride",
          "file",
        ].includes(key)
      )
        next[key] = visit(value)
    }
    return Object.keys(row).every((key) => row[key] === next[key]) ? data : next
  }
  for (const family of ["tasks", "resources", "quick-notes", "overview"]) {
    for (const query of client
      .getQueryCache()
      .findAll({ queryKey: [family] })) {
      if (query.state.data !== undefined) {
        const next = visit(query.state.data)
        if (next !== query.state.data) client.setQueryData(query.queryKey, next)
      }
    }
  }
}
