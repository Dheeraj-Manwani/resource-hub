import "server-only"

import { and, eq, inArray, ne } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import { files, resources } from "@/lib/db/schema"
import { deleteObject, objectKey, putObject } from "@/lib/server/r2"

export type FileRole = "original" | "thumbnail" | "preview"

export async function createPendingFile(
  userId: string,
  {
    name,
    mime,
    size,
    role = "original",
  }: { name: string; mime: string; size: number; role?: FileRole }
) {
  const id = uuidv7()
  const r2Key = objectKey(userId, id, name)
  const [row] = await db
    .insert(files)
    .values({ id, userId, name, mime, size, role, r2Key, status: "pending" })
    .returning()
  return row!
}

export async function getUserFile(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function markFileReady(
  id: string,
  patch: {
    width?: number | null
    height?: number | null
    size?: number
    resourceId?: string | null
  }
) {
  await db
    .update(files)
    .set({ status: "ready", ...patch })
    .where(eq(files.id, id))
}

/** Stores a server-generated object (thumbnails, snapshots) as a ready file. */
export async function storeGeneratedFile(
  userId: string,
  {
    resourceId,
    name,
    mime,
    data,
    width,
    height,
    role,
  }: {
    resourceId: string | null
    name: string
    mime: string
    data: Buffer
    width: number | null
    height: number | null
    role: FileRole
  }
) {
  const id = uuidv7()
  const r2Key = objectKey(userId, id, name)
  await putObject(r2Key, data, mime)
  await db.insert(files).values({
    id,
    userId,
    resourceId,
    role,
    r2Key,
    name,
    mime,
    size: data.byteLength,
    width,
    height,
    status: "ready",
  })
  return id
}

/**
 * Removes a resource's previous generated thumbnails/snapshots (except
 * `keepId`). Objects are deleted best-effort; rows that fail stay marked
 * `deleting` for the Phase 6 cleanup job.
 */
export async function discardOldThumbnails(
  resourceId: string,
  keepId: string | null
) {
  const conditions = [
    eq(files.resourceId, resourceId),
    inArray(files.role, ["thumbnail", "preview"] as FileRole[]),
  ]
  if (keepId) conditions.push(ne(files.id, keepId))
  const old = await db
    .update(files)
    .set({ status: "deleting" })
    .where(and(...conditions))
    .returning({ id: files.id, r2Key: files.r2Key })
  for (const file of old) {
    try {
      await deleteObject(file.r2Key)
      await db.delete(files).where(eq(files.id, file.id))
    } catch (error) {
      console.warn("[files] could not delete object", file.r2Key, error)
    }
  }
}

export async function setResourceThumbnail(
  resourceId: string,
  fileId: string | null
) {
  await db
    .update(resources)
    .set({ thumbnailFileId: fileId })
    .where(eq(resources.id, resourceId))
}
