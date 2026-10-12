import "server-only"

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { projects, quickNotes, tasks } from "@/lib/db/schema"
import { focusSignals, overviewWindow } from "@/lib/overview/model"
import {
  attentionProjectSignals,
  type OverviewSectionData,
} from "@/lib/overview/section-data"
import { notFound } from "@/lib/server/api"
import { getOverviewTaskSignals } from "./overview"
import { getProjectTree } from "./projects"
import { listResources } from "./resources"
import { getSettings } from "./settings"
import { getTasksByIds } from "./tasks"

export async function getRecentlyCompletedTasks(
  userId: string
): Promise<OverviewSectionData["recently-completed-tasks"]> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt),
        eq(tasks.status, "done"),
        isNotNull(tasks.completedAt)
      )
    )
    .orderBy(desc(tasks.completedAt), desc(tasks.id))
    .limit(5)
  const hydrated = await getTasksByIds(
    userId,
    rows.map((task) => task.id)
  )
  const byId = new Map(hydrated.map((task) => [task.id, task]))
  return {
    items: rows.flatMap((row) => (byId.has(row.id) ? [byId.get(row.id)!] : [])),
  }
}

export async function getProjectsNeedingAttention(
  userId: string
): Promise<OverviewSectionData["projects-needing-attention"]> {
  const [settings, tasks, projects] = await Promise.all([
    getSettings(userId),
    getOverviewTaskSignals(userId),
    getProjectTree(userId),
  ])
  const window = overviewWindow(settings.timezone, new Date())
  const attention = attentionProjectSignals(
    projects,
    tasks,
    focusSignals(tasks, window),
    window
  )
  const visible = attention.slice(0, 4)
  const hydrated = await getTasksByIds(userId, [
    ...new Set(
      visible.flatMap((row) =>
        row.attentionTaskId ? [row.attentionTaskId] : []
      )
    ),
  ])
  const byId = new Map(hydrated.map((task) => [task.id, task]))
  return {
    total: attention.length,
    items: visible.map(({ project, attentionTaskId }) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      icon: project.icon,
      color: project.color,
      parentId: project.parentId,
      sortKey: project.sortKey,
      directCount: project.directCount,
      archivedAt: project.archivedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      overdueCount: project.overdueCount,
      blockedCount: project.blockedCount,
      subprojectCount: project.subprojectCount,
      attentionTask: attentionTaskId
        ? (byId.get(attentionTaskId) ?? null)
        : null,
    })),
  }
}

export async function getFavoriteResources(
  userId: string
): Promise<OverviewSectionData["favorite-resources"]> {
  const result = await listResources(userId, {
    favorite: true,
    limit: 5,
    sort: "updated",
    order: "desc",
  })
  return { items: result.items, hasMore: !!result.nextCursor }
}

export async function getDocsByProject(
  userId: string,
  projectId?: string
): Promise<OverviewSectionData["docs-by-project"]> {
  if (projectId && projectId !== "unassigned") {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, userId),
          isNull(projects.deletedAt)
        )
      )
      .limit(1)
    if (!project) throw notFound("Project")
  }
  const scope = and(
    eq(quickNotes.userId, userId),
    isNull(quickNotes.deletedAt),
    projectId === "unassigned"
      ? isNull(quickNotes.projectId)
      : projectId
        ? eq(quickNotes.projectId, projectId)
        : undefined
  )
  // Read only the latest four groups and three lightweight doc summaries per group.
  const groups = await db
    .select({
      projectId: quickNotes.projectId,
      total: sql<number>`count(*)::int`,
    })
    .from(quickNotes)
    .where(scope)
    .groupBy(quickNotes.projectId)
    .orderBy(
      desc(sql`max(${quickNotes.updatedAt})`),
      sql`${quickNotes.projectId} asc nulls last`
    )
    .limit(4)
  return {
    groups: await Promise.all(
      groups.map(async (group) => {
        const docs = await db
          .select({
            id: quickNotes.id,
            title: quickNotes.title,
            kind: quickNotes.kind,
            projectId: quickNotes.projectId,
            updatedAt: quickNotes.updatedAt,
          })
          .from(quickNotes)
          .where(
            and(
              scope,
              group.projectId
                ? eq(quickNotes.projectId, group.projectId)
                : isNull(quickNotes.projectId)
            )
          )
          .orderBy(desc(quickNotes.updatedAt), desc(quickNotes.id))
          .limit(3)
        return {
          projectId: group.projectId,
          total: group.total,
          docs: docs.map((doc) => ({
            ...doc,
            updatedAt: doc.updatedAt.toISOString(),
          })),
        }
      })
    ),
  }
}
