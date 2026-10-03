import "server-only"

import { and, asc, eq, ilike, inArray, ne, sql } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db, type Db } from "@/lib/db"
import { resourceTags, tags, taskTags } from "@/lib/db/schema"
import type { TagDto } from "@/lib/resources/dto"
import { notFound } from "@/lib/server/api"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db

export function normalizeTagName(name: string) {
  return name.trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase()
}

export async function searchTags(
  userId: string,
  q: string | undefined,
  limit = 20
): Promise<TagDto[]> {
  const where = q?.trim()
    ? and(
        eq(tags.userId, userId),
        ilike(
          tags.nameNormalized,
          `%${normalizeTagName(q).replace(/[%_\\]/g, "\\$&")}%`
        )
      )
    : eq(tags.userId, userId)
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(where)
    .orderBy(asc(tags.nameNormalized))
    .limit(limit)
}

/** Returns ids for the given names, creating any that don't exist yet. */
export async function ensureTags(
  tx: Tx,
  userId: string,
  names: string[]
): Promise<string[]> {
  const unique = new Map<string, string>()
  for (const name of names) {
    const display = name.trim().replace(/^#/, "").replace(/\s+/g, " ")
    const norm = normalizeTagName(display)
    if (norm && !unique.has(norm)) unique.set(norm, display)
  }
  if (unique.size === 0) return []
  await tx
    .insert(tags)
    .values(
      [...unique].map(([nameNormalized, name]) => ({
        id: uuidv7(),
        userId,
        name,
        nameNormalized,
      }))
    )
    .onConflictDoNothing({ target: [tags.userId, tags.nameNormalized] })
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        inArray(tags.nameNormalized, [...unique.keys()])
      )
    )
  return rows.map((r) => r.id)
}

export async function setResourceTags(
  tx: Tx,
  resourceId: string,
  tagIds: string[]
) {
  await tx.delete(resourceTags).where(eq(resourceTags.resourceId, resourceId))
  if (tagIds.length) {
    await tx
      .insert(resourceTags)
      .values(tagIds.map((tagId) => ({ resourceId, tagId })))
      .onConflictDoNothing()
  }
}

export async function addResourceTags(
  tx: Tx,
  resourceIds: string[],
  tagIds: string[]
) {
  if (!resourceIds.length || !tagIds.length) return
  await tx
    .insert(resourceTags)
    .values(
      resourceIds.flatMap((resourceId) =>
        tagIds.map((tagId) => ({ resourceId, tagId }))
      )
    )
    .onConflictDoNothing()
}

export async function removeResourceTagsByName(
  tx: Tx,
  userId: string,
  resourceIds: string[],
  names: string[]
) {
  if (!resourceIds.length || !names.length) return
  const normalized = [...new Set(names.map(normalizeTagName).filter(Boolean))]
  if (!normalized.length) return
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.nameNormalized, normalized)))
  const tagIds = rows.map((r) => r.id)
  if (!tagIds.length) return
  await tx
    .delete(resourceTags)
    .where(
      and(
        inArray(resourceTags.resourceId, resourceIds),
        inArray(resourceTags.tagId, tagIds)
      )
    )
}

export async function tagsForResources(
  resourceIds: string[]
): Promise<Map<string, TagDto[]>> {
  const map = new Map<string, TagDto[]>()
  if (!resourceIds.length) return map
  const rows = await db
    .select({
      resourceId: resourceTags.resourceId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(resourceTags)
    .innerJoin(tags, eq(tags.id, resourceTags.tagId))
    .where(inArray(resourceTags.resourceId, resourceIds))
    .orderBy(sql`lower(${tags.name})`)
  for (const { resourceId, ...tag } of rows) {
    const list = map.get(resourceId) ?? []
    list.push(tag)
    map.set(resourceId, list)
  }
  return map
}

export async function createTag(
  userId: string,
  name: string
): Promise<TagDto | null> {
  const [id] = await ensureTags(db, userId, [name])
  if (!id) return null
  const [tag] = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
  return tag ?? null
}

export type TagWithCounts = TagDto & {
  resourceCount: number
  taskCount: number
}

/** Every tag for the user with resource/task usage counts, for the Tags page. */
export async function listTagsWithCounts(
  userId: string
): Promise<TagWithCounts[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      resourceCount: sql<number>`count(distinct ${resourceTags.resourceId})::int`,
      taskCount: sql<number>`count(distinct ${taskTags.taskId})::int`,
    })
    .from(tags)
    .leftJoin(resourceTags, eq(resourceTags.tagId, tags.id))
    .leftJoin(taskTags, eq(taskTags.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id)
    .orderBy(asc(tags.nameNormalized))
  return rows
}

async function getOwnedTag(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .limit(1)
  return row ?? null
}

/** Renames a tag. If another tag already has the new (normalized) name, the
 * two are merged into that existing tag instead of colliding on the unique
 * index. */
export async function renameTag(
  userId: string,
  id: string,
  name: string
): Promise<TagDto | null> {
  const existing = await getOwnedTag(userId, id)
  if (!existing) throw notFound("Tag")
  const display = name.trim().replace(/^#/, "").replace(/\s+/g, " ")
  const normalized = normalizeTagName(display)
  if (!normalized) throw notFound("Tag")
  if (normalized === existing.nameNormalized) {
    const [updated] = await db
      .update(tags)
      .set({ name: display })
      .where(eq(tags.id, id))
      .returning({ id: tags.id, name: tags.name, color: tags.color })
    return updated ?? null
  }
  const [collision] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.nameNormalized, normalized)))
    .limit(1)
  if (collision) {
    await mergeTags(userId, [id], collision.id)
    const [merged] = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.id, collision.id))
    return merged ?? null
  }
  const [updated] = await db
    .update(tags)
    .set({ name: display, nameNormalized: normalized })
    .where(eq(tags.id, id))
    .returning({ id: tags.id, name: tags.name, color: tags.color })
  return updated ?? null
}

export async function setTagColor(
  userId: string,
  id: string,
  color: string | null
): Promise<TagDto | null> {
  const existing = await getOwnedTag(userId, id)
  if (!existing) throw notFound("Tag")
  const [updated] = await db
    .update(tags)
    .set({ color })
    .where(eq(tags.id, id))
    .returning({ id: tags.id, name: tags.name, color: tags.color })
  return updated ?? null
}

/** Re-points every resource/task tagged with `sourceIds` onto `targetId`
 * (deduping join rows) and deletes the source tags, in one transaction. */
export async function mergeTags(
  userId: string,
  sourceIds: string[],
  targetId: string
): Promise<void> {
  const ids = sourceIds.filter((id) => id !== targetId)
  if (!ids.length) return
  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, [...ids, targetId])))
    const ownedIds = new Set(owned.map((r) => r.id))
    if (!ownedIds.has(targetId)) throw notFound("Tag")
    const sources = ids.filter((id) => ownedIds.has(id))
    if (!sources.length) return

    const resourceRows = await tx
      .select({ resourceId: resourceTags.resourceId })
      .from(resourceTags)
      .where(inArray(resourceTags.tagId, sources))
    if (resourceRows.length) {
      await tx
        .insert(resourceTags)
        .values(resourceRows.map((r) => ({ resourceId: r.resourceId, tagId: targetId })))
        .onConflictDoNothing()
    }
    const taskRows = await tx
      .select({ taskId: taskTags.taskId })
      .from(taskTags)
      .where(inArray(taskTags.tagId, sources))
    if (taskRows.length) {
      await tx
        .insert(taskTags)
        .values(taskRows.map((r) => ({ taskId: r.taskId, tagId: targetId })))
        .onConflictDoNothing()
    }
    await tx.delete(tags).where(and(inArray(tags.id, sources), ne(tags.id, targetId)))
  })
}

/** Deletes a tag outright (not soft-deleted: it's just a label, and the join
 * rows cascade). */
export async function deleteTag(userId: string, id: string): Promise<boolean> {
  const result = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning({ id: tags.id })
  return result.length > 0
}
