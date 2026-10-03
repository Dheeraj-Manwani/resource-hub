import "server-only"

import { and, desc, eq } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import { files, quickNotes } from "@/lib/db/schema"
import { toQuickNoteDto, type QuickNoteDto } from "@/lib/quick-notes/dto"
import { badRequest, notFound } from "@/lib/server/api"
import { getUserFile, markFileReady } from "@/lib/server/dal/files"
import { imageDimensions } from "@/lib/server/images"
import {
  deleteObject,
  getObjectBytes,
  headObject,
  publicUrlFor,
} from "@/lib/server/r2"

type QuickNoteInput = {
  title?: string | null
  bodyJson?: unknown
  bodyText?: string | null
}

export async function listQuickNotes(userId: string): Promise<QuickNoteDto[]> {
  const rows = await db
    .select()
    .from(quickNotes)
    .where(eq(quickNotes.userId, userId))
    .orderBy(desc(quickNotes.updatedAt))
  return rows.map(toQuickNoteDto)
}

export async function createQuickNote(
  userId: string,
  input: QuickNoteInput = {}
): Promise<QuickNoteDto> {
  const [row] = await db
    .insert(quickNotes)
    .values({ id: uuidv7(), userId, ...input })
    .returning()
  return toQuickNoteDto(row)
}

export async function updateQuickNote(
  userId: string,
  id: string,
  input: QuickNoteInput
): Promise<QuickNoteDto> {
  const [row] = await db
    .update(quickNotes)
    .set(input)
    .where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)))
    .returning()
  if (!row) throw notFound("Note")
  return toQuickNoteDto(row)
}

export async function deleteQuickNote(
  userId: string,
  id: string
): Promise<boolean> {
  const result = await db
    .delete(quickNotes)
    .where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)))
    .returning({ id: quickNotes.id })
  return result.length > 0
}

export type QuickNoteImage = {
  id: string
  url: string
  width: number | null
  height: number | null
}

/** Verifies a pasted/dropped image landed in R2, reads its dimensions and
 * marks it ready. Unlike resource uploads this never creates a `resources`
 * row — the image lives only inside the note's Tiptap doc, referencing this
 * file by id/url. */
export async function completeQuickNoteImage(
  userId: string,
  fileId: string
): Promise<QuickNoteImage> {
  const file = await getUserFile(userId, fileId)
  if (!file) throw notFound("Image")
  if (file.status !== "pending") throw badRequest("Image already uploaded")

  const head = await headObject(file.r2Key)
  if (!head) throw badRequest("The image hasn't finished uploading yet")
  if (
    head.size !== file.size ||
    (head.contentType && head.contentType !== file.mime)
  ) {
    await deleteObject(file.r2Key).catch(() => {})
    await db.delete(files).where(eq(files.id, file.id))
    throw badRequest("Uploaded image doesn't match what was announced")
  }

  const { width, height } = await imageDimensions(
    await getObjectBytes(file.r2Key)
  )
  await markFileReady(file.id, { width, height })
  return {
    id: file.id,
    url: publicUrlFor(file.r2Key) ?? `/api/files/${file.id}`,
    width,
    height,
  }
}
