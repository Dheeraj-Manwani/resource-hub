import "server-only"

import type { ResourceDto } from "@/lib/resources/dto"
import type { TaskDto } from "@/lib/tasks/types"

import { getProjectTree } from "./projects"
import { listResources } from "./resources"
import { listTagsWithCounts } from "./tags"
import { listTasks } from "./tasks"

export type ExportDocument = {
  exportedAt: string
  version: 1
  projects: Awaited<ReturnType<typeof getProjectTree>>
  resources: ResourceDto[]
  tasks: TaskDto[]
  tags: Awaited<ReturnType<typeof listTagsWithCounts>>
}

/** The whole library as plain JSON: project tree, every resource (with its
 * metadata snapshot and file references), every task (with checklists,
 * linked resources and reminders), and tags. Paginates through the regular
 * list DALs rather than a bespoke query, so export sees exactly what the
 * app sees. */
export async function buildExport(userId: string): Promise<ExportDocument> {
  const resources: ResourceDto[] = []
  let cursor: string | null = null
  do {
    const page = await listResources(userId, {
      limit: 100,
      sort: "created",
      order: "asc",
      cursor: cursor ?? undefined,
    })
    resources.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)

  const tasks: TaskDto[] = []
  cursor = null
  do {
    const page = await listTasks(userId, {
      limit: 200,
      sort: "sortKey",
      order: "asc",
      includeArchived: true,
      cursor: cursor ?? undefined,
    })
    tasks.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)

  const [projects, tags] = await Promise.all([
    getProjectTree(userId),
    listTagsWithCounts(userId),
  ])

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    projects,
    resources,
    tasks,
    tags,
  }
}
