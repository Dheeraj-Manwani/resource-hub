import "server-only"

import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  not,
  sql,
  type SQL,
} from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import {
  files,
  projects,
  projectResources,
  resources,
  resourceTags,
  taskResources,
} from "@/lib/db/schema"
import { nextSortKey } from "@/lib/projects/sort-key"
import type {
  FileDto,
  ResourceDto,
  ResourcePage,
  TagDto,
} from "@/lib/resources/dto"
import type {
  EmbedStatus,
  MetadataStatus,
  ResourceMetadata,
  ResourceType,
} from "@/lib/resources/types"
import { publicUrlFor } from "@/lib/server/r2"
import type {
  ListResourcesQuery,
  UpdateResourceInput,
} from "@/lib/validation/resources"

import { projectsForResources } from "./project-links"
import { ensureTags, setResourceTags, tagsForResources } from "./tags"
import { taskCountsForResources } from "./tasks"

type ResourceRow = typeof resources.$inferSelect
type FileRow = typeof files.$inferSelect

// ------------------------------------------------------------------ mapping

function fileDto(file: FileRow): FileDto {
  return {
    id: file.id,
    name: file.name,
    mime: file.mime,
    size: file.size,
    width: file.width,
    height: file.height,
    url: publicUrlFor(file.r2Key) ?? `/api/files/${file.id}`,
    downloadUrl: `/api/files/${file.id}?download=1`,
  }
}

function toDto(
  row: ResourceRow,
  tags: TagDto[],
  file: FileRow | undefined,
  projectChips: ResourceDto["projects"],
  taskCount: number,
  thumbnailKeys: Map<string, string>
): ResourceDto {
  const metadata: ResourceMetadata = {
    ...row.metadata,
    ...(row.metadataOverride ?? {}),
  }
  const thumbnailKey = row.thumbnailFileId ? thumbnailKeys.get(row.thumbnailFileId) : undefined
  return {
    id: row.id,
    type: row.type,
    url: row.url,
    title: row.title,
    description: row.description,
    notes: row.notes,
    bodyJson: (row.bodyJson as Record<string, unknown> | null) ?? null,
    bodyText: row.type === "note" ? row.extractedText : null,
    metadata,
    metadataOverride: row.metadataOverride ?? null,
    metadataStatus: row.metadataStatus,
    metadataFetchedAt: row.metadataFetchedAt?.toISOString() ?? null,
    embedStatus: row.embedStatus,
    isFavorite: row.isFavorite,
    isReviewed: row.isReviewed,
    thumbnailUrl: row.thumbnailFileId
      ? (thumbnailKey ? publicUrlFor(thumbnailKey) : null) ?? `/api/files/${row.thumbnailFileId}`
      : (row.metadataOverride?.image ?? row.metadata.image ?? null),
    file: file ? fileDto(file) : null,
    tags,
    projects: projectChips,
    taskCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function toDtos(rows: ResourceRow[]): Promise<ResourceDto[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const thumbnailFileIds = rows
    .map((r) => r.thumbnailFileId)
    .filter((id): id is string => !!id)
  const [tagMap, originals, projectMap, taskCountMap, thumbnailFiles] = await Promise.all([
    tagsForResources(ids),
    db
      .select()
      .from(files)
      .where(
        and(
          inArray(files.resourceId, ids),
          eq(files.role, "original"),
          eq(files.status, "ready")
        )
      ),
    projectsForResources(ids),
    taskCountsForResources(ids),
    thumbnailFileIds.length
      ? db
          .select({ id: files.id, r2Key: files.r2Key })
          .from(files)
          .where(inArray(files.id, thumbnailFileIds))
      : Promise.resolve([]),
  ])
  const fileMap = new Map(originals.map((f) => [f.resourceId!, f]))
  const thumbnailKeys = new Map(thumbnailFiles.map((f) => [f.id, f.r2Key]))
  return rows.map((row) =>
    toDto(
      row,
      tagMap.get(row.id) ?? [],
      fileMap.get(row.id),
      projectMap.get(row.id) ?? [],
      taskCountMap.get(row.id) ?? 0,
      thumbnailKeys
    )
  )
}

// ------------------------------------------------------------------ queries

function encodeCursor(value: string, id: string) {
  return Buffer.from(JSON.stringify([value, id])).toString("base64url")
}

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as unknown
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    ) {
      return [parsed[0], parsed[1]]
    }
  } catch {
    // fall through
  }
  return null
}

/** Keyset-paginated list; the cursor carries the exact sort value as text.
 * `projectIds`, when given, scopes to resources linked to any of those
 * projects (the route resolves descendants into this list beforehand). */
export async function listResources(
  userId: string,
  query: ListResourcesQuery,
  scope?: { projectIds?: string[] }
): Promise<ResourcePage> {
  const sortExpr: SQL =
    query.sort === "title"
      ? sql`lower(coalesce(${resources.title}, ${resources.metadata}->>'title', ${resources.url}, ''))`
      : query.sort === "updated"
        ? sql`${resources.updatedAt}`
        : sql`${resources.createdAt}`
  const cast = sql.raw(query.sort === "title" ? "" : "::timestamptz")

  const conditions: SQL[] = [
    eq(resources.userId, userId),
    isNull(resources.deletedAt),
  ]
  if (query.type) conditions.push(eq(resources.type, query.type))
  if (query.favorite !== undefined)
    conditions.push(eq(resources.isFavorite, query.favorite))
  if (query.reviewed !== undefined)
    conditions.push(eq(resources.isReviewed, query.reviewed))
  if (query.tag) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(resourceTags)
          .where(
            and(
              eq(resourceTags.resourceId, resources.id),
              eq(resourceTags.tagId, query.tag)
            )
          )
      )
    )
  }
  if (scope?.projectIds?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(projectResources)
          .innerJoin(projects, eq(projects.id, projectResources.projectId))
          .where(
            and(
              eq(projectResources.resourceId, resources.id),
              inArray(projectResources.projectId, scope.projectIds),
              isNull(projects.deletedAt)
            )
          )
      )
    )
  }
  if (query.unsorted) {
    conditions.push(
      not(
        exists(
          db
            .select({ one: sql`1` })
            .from(projectResources)
            .innerJoin(projects, eq(projects.id, projectResources.projectId))
            .where(
              and(
                eq(projectResources.resourceId, resources.id),
                isNull(projects.deletedAt)
              )
            )
        )
      )
    )
  }
  if (query.hasTasks !== undefined) {
    const linked = exists(
      db
        .select({ one: sql`1` })
        .from(taskResources)
        .where(eq(taskResources.resourceId, resources.id))
    )
    conditions.push(query.hasTasks ? linked : not(linked))
  }

  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  if (cursor) {
    const [value, id] = cursor
    conditions.push(
      query.order === "desc"
        ? sql`(${sortExpr}, ${resources.id}) < (${value}${cast}, ${id}::uuid)`
        : sql`(${sortExpr}, ${resources.id}) > (${value}${cast}, ${id}::uuid)`
    )
  }

  const direction = query.order === "desc" ? desc : asc
  const rows = await db
    .select({ row: resources, sortValue: sql<string>`(${sortExpr})::text` })
    .from(resources)
    .where(and(...conditions))
    .orderBy(direction(sortExpr), direction(resources.id))
    .limit(query.limit + 1)

  const page = rows.slice(0, query.limit)
  const last = page.at(-1)
  return {
    items: await toDtos(page.map((r) => r.row)),
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor(last.sortValue, last.row.id)
        : null,
  }
}

export async function getResourceRow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.id, id),
        eq(resources.userId, userId),
        isNull(resources.deletedAt)
      )
    )
    .limit(1)
  return row ?? null
}

export async function getResource(
  userId: string,
  id: string
): Promise<ResourceDto | null> {
  const row = await getResourceRow(userId, id)
  if (!row) return null
  const [dto] = await toDtos([row])
  return dto ?? null
}

export async function getResourcesByIds(
  userId: string,
  ids: string[]
): Promise<ResourceDto[]> {
  if (!ids.length) return []
  const rows = await db
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.userId, userId),
        inArray(resources.id, ids),
        isNull(resources.deletedAt)
      )
    )
  const byId = new Map(rows.map((r) => [r.id, r]))
  return toDtos(
    ids.map((id) => byId.get(id)).filter((r): r is ResourceRow => !!r)
  )
}

export async function findDuplicate(userId: string, urlNormalized: string) {
  const [row] = await db
    .select({
      id: resources.id,
      title: resources.title,
      metadata: resources.metadata,
      type: resources.type,
      url: resources.url,
    })
    .from(resources)
    .where(
      and(
        eq(resources.userId, userId),
        eq(resources.urlNormalized, urlNormalized),
        isNull(resources.deletedAt)
      )
    )
    .orderBy(desc(resources.createdAt))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    type: row.type,
    url: row.url,
    title: row.title ?? row.metadata.title ?? null,
  }
}

// ---------------------------------------------------------------- mutations

export type NewResource = {
  type: ResourceType
  url?: string | null
  urlNormalized?: string | null
  title?: string | null
  notes?: string | null
  metadata: ResourceMetadata
  metadataStatus: MetadataStatus
  embedStatus?: EmbedStatus
  bodyJson?: Record<string, unknown> | null
  extractedText?: string | null
  thumbnailFileId?: string | null
  isReviewed?: boolean
  isFavorite?: boolean
  tags?: string[]
  /** Link these pending/ready file rows to the new resource. */
  fileIds?: string[]
  /** File into these projects immediately (defaults to unfiled/Inbox). */
  projectIds?: string[]
}

export async function insertResources(
  userId: string,
  inputs: NewResource[]
): Promise<ResourceDto[]> {
  if (!inputs.length) return []
  const ids = await db.transaction(async (tx) => {
    const created: string[] = []
    const tagCache = new Map<string, string[]>()
    const projectCursors = new Map<string, string | null>()
    async function cursorFor(projectId: string) {
      if (projectCursors.has(projectId)) return projectCursors.get(projectId)!
      const [last] = await tx
        .select({ sortKey: projectResources.sortKey })
        .from(projectResources)
        .where(eq(projectResources.projectId, projectId))
        .orderBy(sql`${projectResources.sortKey} desc`)
        .limit(1)
      const cursor = last?.sortKey ?? null
      projectCursors.set(projectId, cursor)
      return cursor
    }
    for (const input of inputs) {
      const id = uuidv7()
      const now = new Date()
      await tx.insert(resources).values({
        id,
        userId,
        type: input.type,
        url: input.url ?? null,
        urlNormalized: input.urlNormalized ?? null,
        title: input.title?.trim() || null,
        notes: input.notes ?? null,
        metadata: input.metadata,
        metadataStatus: input.metadataStatus,
        embedStatus: input.embedStatus ?? "unknown",
        bodyJson: input.bodyJson ?? null,
        extractedText: input.extractedText ?? null,
        thumbnailFileId: input.thumbnailFileId ?? null,
        isReviewed: input.isReviewed ?? false,
        isFavorite: input.isFavorite ?? false,
        metadataFetchedAt: input.metadataStatus === "ok" ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      if (input.fileIds?.length) {
        await tx
          .update(files)
          .set({ resourceId: id })
          .where(
            and(eq(files.userId, userId), inArray(files.id, input.fileIds))
          )
      }
      if (input.tags?.length) {
        const key = input.tags.join("\u0000")
        let tagIds = tagCache.get(key)
        if (!tagIds) {
          tagIds = await ensureTags(tx, userId, input.tags)
          tagCache.set(key, tagIds)
        }
        await setResourceTags(tx, id, tagIds)
      }
      if (input.projectIds?.length) {
        for (const projectId of input.projectIds) {
          const cursor = nextSortKey(await cursorFor(projectId))
          projectCursors.set(projectId, cursor)
          await tx
            .insert(projectResources)
            .values({ projectId, resourceId: id, sortKey: cursor })
            .onConflictDoNothing()
        }
      }
      created.push(id)
    }
    return created
  })
  return getResourcesByIds(userId, ids)
}

export async function updateResource(
  userId: string,
  id: string,
  patch: UpdateResourceInput
): Promise<{ dto: ResourceDto; refetchMetadata: boolean } | null> {
  const existing = await getResourceRow(userId, id)
  if (!existing) return null

  const set: Partial<typeof resources.$inferInsert> = { updatedAt: new Date() }
  if (patch.title !== undefined) set.title = patch.title?.trim() || null
  if (patch.notes !== undefined) set.notes = patch.notes
  if (patch.description !== undefined) set.description = patch.description
  if (patch.isFavorite !== undefined) set.isFavorite = patch.isFavorite
  if (patch.isReviewed !== undefined) set.isReviewed = patch.isReviewed
  if (patch.embedStatus !== undefined) set.embedStatus = patch.embedStatus
  if (patch.metadataOverride !== undefined) {
    set.metadataOverride = patch.metadataOverride
      ? Object.fromEntries(
          Object.entries(patch.metadataOverride).filter(
            ([, v]) => v !== undefined && v !== ""
          )
        )
      : null
  }
  if (patch.bodyJson !== undefined) set.bodyJson = patch.bodyJson
  if (patch.bodyText !== undefined && existing.type === "note")
    set.extractedText = patch.bodyText

  let refetchMetadata = false
  if (patch.type && patch.type !== existing.type) {
    set.type = patch.type
    if (existing.url && !["note", "image", "file"].includes(patch.type)) {
      set.metadataStatus = "pending"
      refetchMetadata = true
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(resources)
      .set(set)
      .where(and(eq(resources.id, id), eq(resources.userId, userId)))
    if (patch.tags) {
      const tagIds = await ensureTags(tx, userId, patch.tags)
      await setResourceTags(tx, id, tagIds)
    }
  })
  const dto = await getResource(userId, id)
  return dto ? { dto, refetchMetadata } : null
}

export async function softDeleteResource(userId: string, id: string) {
  const result = await db
    .update(resources)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(resources.id, id),
        eq(resources.userId, userId),
        isNull(resources.deletedAt)
      )
    )
    .returning({ id: resources.id })
  return result.length > 0
}

export async function markMetadataPending(userId: string, id: string) {
  const result = await db
    .update(resources)
    .set({ metadataStatus: "pending" })
    .where(
      and(
        eq(resources.id, id),
        eq(resources.userId, userId),
        isNull(resources.deletedAt)
      )
    )
    .returning({ id: resources.id })
  return result.length > 0
}

/** Of the given ids, those actually owned (and not trashed) by this user. */
export async function filterOwnedResourceIds(
  userId: string,
  ids: string[]
): Promise<string[]> {
  if (!ids.length) return []
  const rows = await db
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(
        eq(resources.userId, userId),
        inArray(resources.id, ids),
        isNull(resources.deletedAt)
      )
    )
  return rows.map((r) => r.id)
}

export async function setFavoriteMany(
  userId: string,
  ids: string[],
  value: boolean
) {
  if (!ids.length) return
  await db
    .update(resources)
    .set({ isFavorite: value, updatedAt: new Date() })
    .where(
      and(
        eq(resources.userId, userId),
        inArray(resources.id, ids),
        isNull(resources.deletedAt)
      )
    )
}

export async function softDeleteResources(userId: string, ids: string[]) {
  if (!ids.length) return
  await db
    .update(resources)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(resources.userId, userId),
        inArray(resources.id, ids),
        isNull(resources.deletedAt)
      )
    )
}

export async function countResources(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resources)
    .where(and(eq(resources.userId, userId), isNull(resources.deletedAt)))
  return row?.count ?? 0
}

/** Totals for the Overview page: everything, favorited, and unfiled (inbox). */
export async function resourceOverviewCounts(
  userId: string
): Promise<{ total: number; favorites: number; inbox: number }> {
  const unfiled = not(
    exists(
      db
        .select({ one: sql`1` })
        .from(projectResources)
        .innerJoin(projects, eq(projects.id, projectResources.projectId))
        .where(
          and(
            eq(projectResources.resourceId, resources.id),
            isNull(projects.deletedAt)
          )
        )
    )
  )
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      favorites: sql<number>`count(*) filter (where ${resources.isFavorite})::int`,
      inbox: sql<number>`count(*) filter (where ${unfiled})::int`,
    })
    .from(resources)
    .where(and(eq(resources.userId, userId), isNull(resources.deletedAt)))
  return {
    total: row?.total ?? 0,
    favorites: row?.favorites ?? 0,
    inbox: row?.inbox ?? 0,
  }
}
