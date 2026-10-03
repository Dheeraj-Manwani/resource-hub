import "server-only"

import { and, desc, eq, isNotNull, lt } from "drizzle-orm"

import { db } from "@/lib/db"
import { files, projects, resources, tasks } from "@/lib/db/schema"
import { displayTitle } from "@/lib/resources/dto"
import type { ResourceType } from "@/lib/resources/types"
import { deleteObject, isStorageConfigured } from "@/lib/server/r2"

export type TrashEntityType = "resource" | "task" | "project"

export type TrashItem = {
  id: string
  entityType: TrashEntityType
  title: string
  resourceType: ResourceType | null
  deletedAt: string
}

const LIST_LIMIT = 300

/** Everything currently in Trash for the user, newest-deleted first. The
 * personal library is small, so each entity's trashed rows are loaded whole
 * (same rationale as the project tree) rather than cursor-paginated. */
export async function listTrash(userId: string): Promise<TrashItem[]> {
  const [resourceRows, taskRows, projectRows] = await Promise.all([
    db
      .select({
        id: resources.id,
        title: resources.title,
        type: resources.type,
        url: resources.url,
        metadata: resources.metadata,
        deletedAt: resources.deletedAt,
      })
      .from(resources)
      .where(and(eq(resources.userId, userId), isNotNull(resources.deletedAt)))
      .orderBy(desc(resources.deletedAt))
      .limit(LIST_LIMIT),
    db
      .select({ id: tasks.id, title: tasks.title, deletedAt: tasks.deletedAt })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt)))
      .orderBy(desc(tasks.deletedAt))
      .limit(LIST_LIMIT),
    db
      .select({ id: projects.id, name: projects.name, deletedAt: projects.deletedAt })
      .from(projects)
      .where(and(eq(projects.userId, userId), isNotNull(projects.deletedAt)))
      .orderBy(desc(projects.deletedAt))
      .limit(LIST_LIMIT),
  ])

  const items: TrashItem[] = [
    ...resourceRows.map((r) => ({
      id: r.id,
      entityType: "resource" as const,
      title: displayTitle({
        title: r.title,
        metadata: r.metadata,
        url: r.url,
        type: r.type,
        bodyText: null,
        file: null,
      }),
      resourceType: r.type,
      deletedAt: r.deletedAt!.toISOString(),
    })),
    ...taskRows.map((t) => ({
      id: t.id,
      entityType: "task" as const,
      title: t.title,
      resourceType: null,
      deletedAt: t.deletedAt!.toISOString(),
    })),
    ...projectRows.map((p) => ({
      id: p.id,
      entityType: "project" as const,
      title: p.name,
      resourceType: null,
      deletedAt: p.deletedAt!.toISOString(),
    })),
  ]
  return items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
}

export async function restoreResource(userId: string, id: string): Promise<boolean> {
  const result = await db
    .update(resources)
    .set({ deletedAt: null })
    .where(
      and(eq(resources.id, id), eq(resources.userId, userId), isNotNull(resources.deletedAt))
    )
    .returning({ id: resources.id })
  return result.length > 0
}

export async function restoreTask(userId: string, id: string): Promise<boolean> {
  const result = await db
    .update(tasks)
    .set({ deletedAt: null })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNotNull(tasks.deletedAt)))
    .returning({ id: tasks.id })
  return result.length > 0
}

/** Restores a project to its parent, or to the root if the parent no longer
 * exists or is itself still in Trash. */
export async function restoreProject(userId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ parentId: projects.parentId })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId), isNotNull(projects.deletedAt)))
    .limit(1)
  if (!row) return false

  let parentId = row.parentId
  if (parentId) {
    const [parent] = await db
      .select({ deletedAt: projects.deletedAt })
      .from(projects)
      .where(and(eq(projects.id, parentId), eq(projects.userId, userId)))
      .limit(1)
    if (!parent || parent.deletedAt) parentId = null
  }
  await db.update(projects).set({ deletedAt: null, parentId }).where(eq(projects.id, id))
  return true
}

async function deleteResourceFiles(userId: string, resourceId: string) {
  const rows = await db
    .select({ id: files.id, r2Key: files.r2Key })
    .from(files)
    .where(and(eq(files.resourceId, resourceId), eq(files.userId, userId)))
  if (!rows.length) return
  if (isStorageConfigured()) {
    for (const file of rows) {
      try {
        await deleteObject(file.r2Key)
      } catch (error) {
        console.warn("[trash] could not delete object", file.r2Key, error)
      }
    }
  }
  await db.delete(files).where(
    and(eq(files.resourceId, resourceId), eq(files.userId, userId))
  )
}

/** Permanently removes a trashed resource: its R2 objects (best-effort),
 * then the row (tags/project links/task links cascade). Only ever acts on a
 * row that's already in Trash. */
export async function permanentlyDeleteResource(
  userId: string,
  id: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(eq(resources.id, id), eq(resources.userId, userId), isNotNull(resources.deletedAt))
    )
    .limit(1)
  if (!row) return false
  await deleteResourceFiles(userId, id)
  await db.delete(resources).where(and(eq(resources.id, id), eq(resources.userId, userId)))
  return true
}

export async function permanentlyDeleteTask(userId: string, id: string): Promise<boolean> {
  const result = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNotNull(tasks.deletedAt)))
    .returning({ id: tasks.id })
  return result.length > 0
}

export async function permanentlyDeleteProject(userId: string, id: string): Promise<boolean> {
  const result = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId), isNotNull(projects.deletedAt)))
    .returning({ id: projects.id })
  return result.length > 0
}

/** Permanently deletes everything currently in Trash for the user. */
export async function emptyTrash(userId: string): Promise<number> {
  const items = await listTrash(userId)
  let count = 0
  for (const item of items) {
    const ok =
      item.entityType === "resource"
        ? await permanentlyDeleteResource(userId, item.id)
        : item.entityType === "task"
          ? await permanentlyDeleteTask(userId, item.id)
          : await permanentlyDeleteProject(userId, item.id)
    if (ok) count++
  }
  return count
}

/** Cron: permanently deletes anything that's been in Trash longer than
 * `maxAgeDays`, across all users. */
export async function purgeOldTrash(maxAgeDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
  let count = 0

  const oldResources = await db
    .select({ id: resources.id, userId: resources.userId })
    .from(resources)
    .where(and(isNotNull(resources.deletedAt), lt(resources.deletedAt, cutoff)))
  for (const r of oldResources) {
    if (await permanentlyDeleteResource(r.userId, r.id)) count++
  }

  const oldTasks = await db
    .select({ id: tasks.id, userId: tasks.userId })
    .from(tasks)
    .where(and(isNotNull(tasks.deletedAt), lt(tasks.deletedAt, cutoff)))
  for (const t of oldTasks) {
    if (await permanentlyDeleteTask(t.userId, t.id)) count++
  }

  const oldProjects = await db
    .select({ id: projects.id, userId: projects.userId })
    .from(projects)
    .where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, cutoff)))
  for (const p of oldProjects) {
    if (await permanentlyDeleteProject(p.userId, p.id)) count++
  }

  return count
}
