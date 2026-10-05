import type { QueryClient } from "@tanstack/react-query"
import type { TaskFilters } from "@/hooks/queries/tasks"
import type { ResourceFilters } from "@/hooks/queries/resources"
import type { TaskDto } from "@/lib/tasks/types"
import type { ResourceDto } from "@/lib/resources/dto"
import { taskReferences, resourceReferences } from "./references"
import { entityCache } from "./entity-cache"
import { compareValues, inProject } from "./lists"

export function taskMatches(
  client: QueryClient,
  task: TaskDto,
  filters: TaskFilters
): boolean | undefined {
  if (
    (!filters.includeArchived && task.archivedAt) ||
    (filters.status && task.status !== filters.status) ||
    (filters.priority && task.priority !== filters.priority)
  )
    return false
  if (filters.tag && !task.tags.some((tag) => tag.id === filters.tag))
    return false
  const projectMatch = filters.projectId
    ? inProject(
        client,
        task.projectId,
        filters.projectId,
        filters.includeDescendants
      )
    : true
  if (projectMatch === false) return false
  if (filters.smartFilter === "completed" && task.status !== "done")
    return false
  if (filters.smartFilter === "no_date" && (task.dueAt || task.dueDate))
    return false
  if (["today", "upcoming", "overdue"].includes(filters.smartFilter ?? "")) {
    if (task.status === "done" || (!task.dueAt && !task.dueDate)) return false
    // Date cutoffs belong to the server/DB timezone; don't invent membership.
    return undefined
  }
  return projectMatch
}
export function resourceMatches(
  client: QueryClient,
  item: ResourceDto,
  filters: ResourceFilters
): boolean | undefined {
  if (
    (filters.type && item.type !== filters.type) ||
    (filters.favorite !== undefined && item.isFavorite !== filters.favorite) ||
    (filters.reviewed !== undefined && item.isReviewed !== filters.reviewed) ||
    (filters.hasTasks !== undefined && item.taskCount > 0 !== filters.hasTasks)
  )
    return false
  if (filters.tag && !item.tags.some((tag) => tag.id === filters.tag))
    return false
  if (filters.unsorted && item.projects.length) return false
  if (filters.projectId) {
    const membership = item.projects.map((project) =>
      inProject(
        client,
        project.id,
        filters.projectId!,
        filters.includeDescendants
      )
    )
    return membership.includes(true)
      ? true
      : membership.includes(undefined)
        ? undefined
        : false
  }
  return true
}
const priorities = { low: 1, medium: 2, high: 3, urgent: 4 }
export const taskCache = entityCache<TaskDto, TaskFilters>({
  family: "task",
  decorate: taskReferences,
  lists: ["tasks", "list"],
  detail: (id) => ["tasks", "detail", id],
  matches: taskMatches,
  compare: (filters) => (a, b) => {
    const field = (task: TaskDto) =>
      filters.sort === "title"
        ? task.title.toLowerCase()
        : filters.sort === "priority"
          ? priorities[task.priority]
          : filters.sort === "due"
            ? (task.dueAt ??
              (task.dueDate ? `${task.dueDate}T00:00:00.000Z` : null))
            : filters.sort === "created"
              ? task.createdAt
              : filters.sort === "updated"
                ? task.updatedAt
                : task.sortKey
    return (
      compareValues(field(a), field(b), filters.order) ||
      compareValues(a.id, b.id, filters.order)
    )
  },
})
export const resourceCache = entityCache<ResourceDto, ResourceFilters>({
  family: "resource",
  decorate: resourceReferences,
  lists: ["resources", "list"],
  detail: (id) => ["resources", "detail", id],
  matches: resourceMatches,
  compare: (filters) => (a, b) => {
    const field = (item: ResourceDto) =>
      filters.sort === "title"
        ? (item.title ?? item.metadata.title ?? item.url ?? "").toLowerCase()
        : filters.sort === "updated"
          ? item.updatedAt
          : item.createdAt
    const order = filters.order ?? "desc"
    return (
      compareValues(field(a), field(b), order) ||
      compareValues(a.id, b.id, order)
    )
  },
})
