import "server-only"

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"

import { db, type Db } from "@/lib/db"
import { projectResources, projects, resources } from "@/lib/db/schema"
import { nextSortKey } from "@/lib/projects/sort-key"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db

export type ProjectChipDto = {
  id: string
  name: string
  icon: string | null
  color: string | null
}

/** Projects (non-deleted) each resource belongs to, for card/detail chips. */
export async function projectsForResources(
  resourceIds: string[]
): Promise<Map<string, ProjectChipDto[]>> {
  const map = new Map<string, ProjectChipDto[]>()
  if (!resourceIds.length) return map
  const rows = await db
    .select({
      resourceId: projectResources.resourceId,
      id: projects.id,
      name: projects.name,
      icon: projects.icon,
      color: projects.color,
    })
    .from(projectResources)
    .innerJoin(projects, eq(projects.id, projectResources.projectId))
    .where(
      and(
        inArray(projectResources.resourceId, resourceIds),
        isNull(projects.deletedAt)
      )
    )
    .orderBy(asc(projects.name))
  for (const { resourceId, ...project } of rows) {
    const list = map.get(resourceId) ?? []
    list.push(project)
    map.set(resourceId, list)
  }
  return map
}

async function assertOwnership(
  tx: Tx,
  userId: string,
  projectId: string,
  resourceIds: string[]
) {
  const [project] = await tx
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
  if (!project) return false
  const owned = await tx
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(eq(resources.userId, userId), inArray(resources.id, resourceIds))
    )
  return owned.length === resourceIds.length
}

/** Links resources into a project, appending them after the current last item. */
export async function linkResources(
  userId: string,
  projectId: string,
  resourceIds: string[]
): Promise<boolean> {
  if (!resourceIds.length) return true
  return db.transaction(async (tx) => {
    if (!(await assertOwnership(tx, userId, projectId, resourceIds)))
      return false
    const [last] = await tx
      .select({ sortKey: projectResources.sortKey })
      .from(projectResources)
      .where(eq(projectResources.projectId, projectId))
      .orderBy(sql`${projectResources.sortKey} desc`)
      .limit(1)
    let cursor = last?.sortKey ?? null
    const values = resourceIds.map((resourceId) => {
      cursor = nextSortKey(cursor)
      return { projectId, resourceId, sortKey: cursor }
    })
    await tx.insert(projectResources).values(values).onConflictDoNothing()
    return true
  })
}

export async function unlinkResources(
  userId: string,
  projectId: string,
  resourceIds: string[]
): Promise<boolean> {
  if (!resourceIds.length) return true
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1)
    if (!project) return false
    await tx
      .delete(projectResources)
      .where(
        and(
          eq(projectResources.projectId, projectId),
          inArray(projectResources.resourceId, resourceIds)
        )
      )
    return true
  })
}

/** Moves resources from one project (or unfiled) to another in one transaction. */
export async function moveResources(
  userId: string,
  resourceIds: string[],
  from: string | null,
  to: string | null
): Promise<boolean> {
  if (!resourceIds.length) return true
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(
        and(eq(resources.userId, userId), inArray(resources.id, resourceIds))
      )
    if (owned.length !== resourceIds.length) return false

    if (to) {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, to),
            eq(projects.userId, userId),
            isNull(projects.deletedAt)
          )
        )
        .limit(1)
      if (!project) return false
    }
    if (from) {
      await tx
        .delete(projectResources)
        .where(
          and(
            eq(projectResources.projectId, from),
            inArray(projectResources.resourceId, resourceIds)
          )
        )
    }
    if (to) {
      const [last] = await tx
        .select({ sortKey: projectResources.sortKey })
        .from(projectResources)
        .where(eq(projectResources.projectId, to))
        .orderBy(sql`${projectResources.sortKey} desc`)
        .limit(1)
      let cursor = last?.sortKey ?? null
      const values = resourceIds.map((resourceId) => {
        cursor = nextSortKey(cursor)
        return { projectId: to, resourceId, sortKey: cursor }
      })
      await tx.insert(projectResources).values(values).onConflictDoNothing()
    }
    return true
  })
}

export async function countLinkedResources(projectId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectResources)
    .where(eq(projectResources.projectId, projectId))
  return row?.count ?? 0
}
