import "server-only"

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import { projectResources, projects, resources } from "@/lib/db/schema"
import {
  ancestorChain,
  buildProjectTree,
  descendantIds,
  isSelfOrDescendant,
} from "@/lib/projects/tree"
import { nextSortKey, sortKeyBetween } from "@/lib/projects/sort-key"
import type { ProjectDto } from "@/lib/projects/types"
import type {
  CreateProjectInput,
  MoveProjectInput,
  UpdateProjectInput,
} from "@/lib/validation/projects"

type ProjectRow = typeof projects.$inferSelect

function toDto(row: {
  id: string
  parentId: string | null
  name: string
  description: string | null
  icon: string | null
  color: string | null
  sortKey: string
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  directCount: number
}): ProjectDto {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    sortKey: row.sortKey,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    directCount: row.directCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const directCountExpr = sql<number>`count(${resources.id}) filter (where ${resources.deletedAt} is null)::int`

/** Every non-deleted project for the user, with direct (non-rolled-up) counts.
 * The tree is small (a personal library), so it's loaded whole and roll-ups
 * / cycle checks happen in memory via `lib/projects/tree`. */
export async function getProjectTree(userId: string): Promise<ProjectDto[]> {
  const rows = await db
    .select({
      id: projects.id,
      parentId: projects.parentId,
      name: projects.name,
      description: projects.description,
      icon: projects.icon,
      color: projects.color,
      sortKey: projects.sortKey,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      directCount: directCountExpr,
    })
    .from(projects)
    .leftJoin(projectResources, eq(projectResources.projectId, projects.id))
    .leftJoin(resources, eq(resources.id, projectResources.resourceId))
    .where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
    .groupBy(projects.id)
    .orderBy(asc(projects.sortKey))
  return rows.map(toDto)
}

async function selectProjectRow(userId: string, id: string) {
  const [row] = await db
    .select({
      id: projects.id,
      parentId: projects.parentId,
      name: projects.name,
      description: projects.description,
      icon: projects.icon,
      color: projects.color,
      sortKey: projects.sortKey,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      directCount: directCountExpr,
    })
    .from(projects)
    .leftJoin(projectResources, eq(projectResources.projectId, projects.id))
    .leftJoin(resources, eq(resources.id, projectResources.resourceId))
    .where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId),
        isNull(projects.deletedAt)
      )
    )
    .groupBy(projects.id)
    .limit(1)
  return row ?? null
}

export async function getProjectDto(
  userId: string,
  id: string
): Promise<ProjectDto | null> {
  const row = await selectProjectRow(userId, id)
  return row ? toDto(row) : null
}

/** Project + its ancestor chain (root first), for breadcrumbs. */
export async function getProjectWithAncestors(userId: string, id: string) {
  const flat = await getProjectTree(userId)
  const project = flat.find((p) => p.id === id)
  if (!project) return null
  return { project, ancestors: ancestorChain(flat, id) }
}

/** `id` and every descendant id (self included), computed in memory from the tree. */
export async function getDescendantIds(
  userId: string,
  id: string
): Promise<string[] | null> {
  const flat = await getProjectTree(userId)
  if (!flat.some((p) => p.id === id)) return null
  const tree = buildProjectTree(flat)
  return [...descendantIds(tree, id)]
}

export async function createProject(
  userId: string,
  input: CreateProjectInput
): Promise<ProjectDto | null> {
  const id = uuidv7()
  const ok = await db.transaction(async (tx) => {
    if (input.parentId) {
      const [parent] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.parentId!),
            eq(projects.userId, userId),
            isNull(projects.deletedAt)
          )
        )
        .limit(1)
      if (!parent) return false
    }
    const [last] = await tx
      .select({ sortKey: projects.sortKey })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          input.parentId
            ? eq(projects.parentId, input.parentId)
            : isNull(projects.parentId),
          isNull(projects.deletedAt)
        )
      )
      .orderBy(sql`${projects.sortKey} desc`)
      .limit(1)
    await tx.insert(projects).values({
      id,
      userId,
      parentId: input.parentId ?? null,
      name: input.name.trim(),
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortKey: nextSortKey(last?.sortKey ?? null),
    })
    return true
  })
  if (!ok) return null
  return getProjectDto(userId, id)
}

export async function updateProject(
  userId: string,
  id: string,
  patch: UpdateProjectInput
): Promise<ProjectDto | null> {
  const existing = await selectProjectRow(userId, id)
  if (!existing) return null
  const set: Partial<ProjectRow> = { updatedAt: new Date() }
  if (patch.name !== undefined) set.name = patch.name.trim()
  if (patch.description !== undefined) set.description = patch.description
  if (patch.icon !== undefined) set.icon = patch.icon
  if (patch.color !== undefined) set.color = patch.color
  if (patch.archived !== undefined)
    set.archivedAt = patch.archived ? new Date() : null
  await db
    .update(projects)
    .set(set)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
  return getProjectDto(userId, id)
}

export type MoveProjectResult =
  | { ok: true; dto: ProjectDto }
  | { ok: false; reason: "not_found" | "cycle" }

export async function moveProject(
  userId: string,
  id: string,
  input: MoveProjectInput
): Promise<MoveProjectResult> {
  const flat = await getProjectTree(userId)
  const target = flat.find((p) => p.id === id)
  if (!target) return { ok: false, reason: "not_found" }
  if (input.parentId) {
    if (!flat.some((p) => p.id === input.parentId))
      return { ok: false, reason: "not_found" }
    if (isSelfOrDescendant(flat, id, input.parentId))
      return { ok: false, reason: "cycle" }
  }

  const parentId = input.parentId ?? null
  const siblings = flat
    .filter((p) => p.id !== id && (p.parentId ?? null) === parentId)
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))

  let sortKey: string
  const beforeIdx = input.beforeId
    ? siblings.findIndex((s) => s.id === input.beforeId)
    : -1
  const afterIdx = input.afterId
    ? siblings.findIndex((s) => s.id === input.afterId)
    : -1
  if (beforeIdx >= 0) {
    sortKey = sortKeyBetween(
      siblings[beforeIdx - 1]?.sortKey ?? null,
      siblings[beforeIdx]!.sortKey
    )
  } else if (afterIdx >= 0) {
    sortKey = sortKeyBetween(
      siblings[afterIdx]!.sortKey,
      siblings[afterIdx + 1]?.sortKey ?? null
    )
  } else {
    sortKey = nextSortKey(siblings.at(-1)?.sortKey ?? null)
  }

  await db
    .update(projects)
    .set({ parentId, sortKey, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
  const dto = await getProjectDto(userId, id)
  return dto ? { ok: true, dto } : { ok: false, reason: "not_found" }
}

/**
 * Soft-deletes a project. `subtree` takes the whole branch with it; `reparent`
 * moves direct children up to the deleted project's parent first. Either way,
 * `project_resources` rows are left untouched — resources are never deleted,
 * only no longer visible under the removed project (and come back if it's
 * ever restored from Trash).
 */
export async function deleteProject(
  userId: string,
  id: string,
  mode: "subtree" | "reparent"
): Promise<boolean> {
  const flat = await getProjectTree(userId)
  const target = flat.find((p) => p.id === id)
  if (!target) return false

  await db.transaction(async (tx) => {
    if (mode === "subtree") {
      const tree = buildProjectTree(flat)
      const ids = [...descendantIds(tree, id)]
      await tx
        .update(projects)
        .set({ deletedAt: new Date() })
        .where(and(inArray(projects.id, ids), eq(projects.userId, userId)))
      return
    }

    const newParentId = target.parentId
    const newSiblings = flat
      .filter((p) => p.id !== id && (p.parentId ?? null) === newParentId)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    let cursor = newSiblings.at(-1)?.sortKey ?? null
    const children = flat
      .filter((p) => p.parentId === id)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    for (const child of children) {
      cursor = nextSortKey(cursor)
      await tx
        .update(projects)
        .set({ parentId: newParentId, sortKey: cursor })
        .where(and(eq(projects.id, child.id), eq(projects.userId, userId)))
    }
    await tx
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
  })
  return true
}
