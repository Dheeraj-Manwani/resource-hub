import type { QueryClient } from "@tanstack/react-query"
import type { ResourceDto, ProjectChipDto, TagDto } from "@/lib/resources/dto"
import type { TaskDto, ChecklistItemDto } from "@/lib/tasks/types"
import type { ProjectDto } from "@/lib/projects/types"
import { generateKeyBetween } from "fractional-indexing"
import { resourceCache, taskCache } from "./domains"

let checklistSequence = 0
export const pendingChecklistId = () =>
  `pending-checklist:${++checklistSequence}`

export type EntityTokens = { id: string; token: string }[]
export const beginResources = (
  client: QueryClient,
  ids: string[],
  apply: (row: ResourceDto) => ResourceDto | null
): EntityTokens =>
  [...new Set(ids)].map((id) => ({
    id,
    token: resourceCache.begin(client, id, (row) => (row ? apply(row) : row)),
  }))
export const beginTasks = (
  client: QueryClient,
  ids: string[],
  apply: (row: TaskDto) => TaskDto | null
): EntityTokens =>
  [...new Set(ids)].map((id) => ({
    id,
    token: taskCache.begin(client, id, (row) => (row ? apply(row) : row)),
  }))
export function settleResources(
  client: QueryClient,
  tokens: EntityTokens = [],
  outcome: "rollback" | "commit" | "delete" | ResourceDto[]
) {
  for (const { id, token } of tokens) {
    if (outcome === "commit") resourceCache.commit(client, id, token)
    else
      resourceCache.settle(
        client,
        id,
        token,
        outcome === "delete"
          ? null
          : Array.isArray(outcome)
            ? outcome.find((row) => row.id === id)
            : undefined
      )
  }
}
export function settleTasks(
  client: QueryClient,
  tokens: EntityTokens = [],
  commit: boolean
) {
  for (const { id, token } of tokens) {
    if (commit) taskCache.commit(client, id, token)
    else taskCache.settle(client, id, token)
  }
}
export function resourceProjects(
  client: QueryClient,
  row: ResourceDto,
  remove: string | null,
  add: string | null
): ResourceDto {
  const projects = row.projects.filter((item) => item.id !== remove)
  const project = client
    .getQueryData<{ items: ProjectDto[] }>(["projects", "tree"])
    ?.items.find((item) => item.id === add)
  if (project && !projects.some((item) => item.id === project.id)) {
    const chip: ProjectChipDto = {
      id: project.id,
      name: project.name,
      icon: project.icon,
      color: project.color,
    }
    projects.push(chip)
  }
  return { ...row, projects }
}
export function taskResources(
  client: QueryClient,
  row: TaskDto,
  ids: string[],
  add: boolean
): TaskDto {
  const resources = add
    ? [...row.resources]
    : row.resources.filter((item) => !ids.includes(item.id))
  if (add)
    for (const id of ids) {
      const resource = resourceCache.read(client, id)
      if (resource && !resources.some((item) => item.id === id))
        resources.push({
          id,
          type: resource.type,
          title: resource.title,
          url: resource.url,
          thumbnailUrl: resource.thumbnailUrl,
        })
    }
  return { ...row, resources }
}
export function changeTags(
  client: QueryClient,
  existing: TagDto[],
  names: string[],
  add: boolean
): TagDto[] {
  const normalized = new Set(
    names.map((name) => name.trim().replace(/^#/, "").toLowerCase())
  )
  if (!add)
    return existing.filter((tag) => !normalized.has(tag.name.toLowerCase()))
  const known =
    client.getQueryData<{ items: TagDto[] }>(["tags", "with-counts"])?.items ??
    []
  const tags = [...existing]
  for (const name of normalized)
    if (!tags.some((tag) => tag.name.toLowerCase() === name)) {
      const tag = known.find((tag) => tag.name.toLowerCase() === name)
      // Never expose an invented ID as an actionable tag.
      if (tag) tags.push({ id: tag.id, name: tag.name, color: tag.color })
    }
  return tags
}
export function replaceTags(
  client: QueryClient,
  existing: TagDto[],
  names: string[]
): TagDto[] {
  const keep = new Set(
    names.map((name) => name.trim().replace(/^#/, "").toLowerCase())
  )
  return changeTags(
    client,
    existing.filter((tag) => keep.has(tag.name.toLowerCase())),
    names,
    true
  )
}

export function reorderChecklist(
  items: ChecklistItemDto[],
  itemId: string,
  beforeId?: string,
  afterId?: string
) {
  const item = items.find((item) => item.id === itemId)
  if (!item) return items
  const others = items.filter((item) => item.id !== itemId)
  const before = others.findIndex((item) => item.id === beforeId)
  const after = others.findIndex((item) => item.id === afterId)
  const index = before >= 0 ? before : after >= 0 ? after + 1 : others.length
  const lower = others[index - 1]?.sortKey ?? null,
    upper = others[index]?.sortKey ?? null
  if (lower !== null && upper !== null && lower >= upper) return items
  others.splice(index, 0, {
    ...item,
    sortKey: generateKeyBetween(lower, upper),
  })
  return others
}
