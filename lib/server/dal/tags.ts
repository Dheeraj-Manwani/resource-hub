import "server-only"

import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db, type Db } from "@/lib/db"
import { resourceTags, tags } from "@/lib/db/schema"
import type { TagDto } from "@/lib/resources/dto"

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
