import "server-only"

import { and, desc, eq, inArray, isNull, isNotNull } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import { files, projects, quickNotes, docVersions } from "@/lib/db/schema"
import { workbookSchema, workbookText } from "@/lib/docs/workbook"
import { drawingSchema, drawingText } from "@/lib/docs/drawing"
import {
  toQuickNoteDto,
  type QuickNoteDto,
  type QuickNoteProjectDto,
} from "@/lib/quick-notes/dto"
import { ApiError, badRequest, notFound } from "@/lib/server/api"
import { getUserFile, markFileReady } from "@/lib/server/dal/files"
import { imageDimensions } from "@/lib/server/images"
import {
  deleteObject,
  getObjectBytes,
  headObject,
  publicUrlFor,
} from "@/lib/server/r2"

type QuickNoteInput = {
  clientId?: string
  kind?: "text" | "spreadsheet" | "drawing"
  expectedRevision?: number
  projectId?: string | null
  title?: string | null
  bodyJson?: unknown
  bodyText?: string | null
}

type QuickNoteRow = typeof quickNotes.$inferSelect

async function projectsForNoteRows(rows: QuickNoteRow[]) {
  const ids = [
    ...new Set(rows.map((r) => r.projectId).filter((id): id is string => !!id)),
  ]
  const map = new Map<string, QuickNoteProjectDto>()
  if (!ids.length) return map
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      icon: projects.icon,
      color: projects.color,
    })
    .from(projects)
    .where(inArray(projects.id, ids))
  for (const row of projectRows) map.set(row.id, row)
  return map
}

async function toDtos(rows: QuickNoteRow[]): Promise<QuickNoteDto[]> {
  if (!rows.length) return []
  const projectMap = await projectsForNoteRows(rows)
  return rows.map((row) =>
    toQuickNoteDto(
      row,
      row.projectId ? (projectMap.get(row.projectId) ?? null) : null
    )
  )
}

async function assertProjectOwnership(userId: string, projectId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  return !!row
}

export async function listQuickNotes(
  userId: string,
  scope?: { projectIds?: string[]; trash?: boolean }
): Promise<QuickNoteDto[]> {
  const conditions = [
    eq(quickNotes.userId, userId),
    scope?.trash
      ? isNotNull(quickNotes.deletedAt)
      : isNull(quickNotes.deletedAt),
  ]
  if (scope?.projectIds?.length) {
    conditions.push(inArray(quickNotes.projectId, scope.projectIds))
  }
  const rows = await db
    .select()
    .from(quickNotes)
    .where(and(...conditions))
    .orderBy(desc(quickNotes.updatedAt))
  return toDtos(rows)
}

export async function createQuickNote(
  userId: string,
  input: QuickNoteInput = {}
): Promise<QuickNoteDto | null> {
  if (input.kind === "spreadsheet" && input.bodyJson === undefined) {
    throw badRequest("A spreadsheet needs a workbook.")
  }
  if (input.kind === "drawing" && input.bodyJson === undefined)
    throw badRequest("A drawing needs a scene.")
  if (
    input.projectId &&
    !(await assertProjectOwnership(userId, input.projectId))
  ) {
    return null
  }
  const newId = input.clientId ?? uuidv7()
  const [row] = await db
    .insert(quickNotes)
    .values({
      id: newId,
      userId,
      ...documentValues(input, input.kind ?? "text"),
    })
    .onConflictDoNothing()
    .returning()
  if (!row) {
    // A lost create response can be retried without making a second document.
    return updateQuickNote(userId, newId, { ...input, expectedRevision: 0 })
  }
  const [dto] = await toDtos([row])
  return dto
}

export async function updateQuickNote(
  userId: string,
  id: string,
  input: QuickNoteInput
): Promise<QuickNoteDto | null> {
  if (
    input.projectId &&
    !(await assertProjectOwnership(userId, input.projectId))
  ) {
    return null
  }
  const row = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(quickNotes)
      .where(
        and(
          eq(quickNotes.id, id),
          eq(quickNotes.userId, userId),
          isNull(quickNotes.deletedAt)
        )
      )
      .for("update")
    if (!current) throw notFound("Doc")
    if (input.kind && input.kind !== current.kind)
      throw badRequest("A doc's type cannot be changed.")
    if (
      (current.kind === "spreadsheet" || current.kind === "drawing") &&
      input.bodyJson !== undefined &&
      input.expectedRevision === undefined
    )
      throw badRequest("Spreadsheet and drawing saves require a revision.")
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== current.revision
    )
      throw new ApiError(
        409,
        "This doc changed in another tab. Download a backup of your edits, then reopen the doc.",
        "revision_conflict"
      )
    await tx
      .insert(docVersions)
      .values({
        docId: id,
        revision: current.revision,
        title: current.title,
        bodyJson: current.bodyJson,
        bodyText: current.bodyText,
      })
      .onConflictDoNothing()
    const [updated] = await tx
      .update(quickNotes)
      .set({
        ...documentValues(input, current.kind),
        revision: current.revision + 1,
      })
      .where(eq(quickNotes.id, id))
      .returning()
    return updated
  })
  const [dto] = await toDtos([row])
  return dto
}

export async function deleteQuickNote(
  userId: string,
  id: string
): Promise<boolean> {
  const result = await db
    .update(quickNotes)
    .set({ deletedAt: new Date() })
    .where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)))
    .returning({ id: quickNotes.id })
  return result.length > 0
}

function documentValues(
  input: QuickNoteInput,
  kind: "text" | "spreadsheet" | "drawing"
) {
  const values = { ...input }
  delete values.expectedRevision
  delete values.clientId
  if (kind === "spreadsheet" && values.bodyJson !== undefined) {
    values.bodyJson = workbookSchema.parse(values.bodyJson)
    values.bodyText = workbookText(values.bodyJson)
  }
  if (kind === "drawing" && values.bodyJson !== undefined) {
    const drawing = drawingSchema.parse(values.bodyJson)
    values.bodyJson = drawing
    values.bodyText = drawingText(drawing)
  }
  return values
}

export async function getDoc(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(quickNotes)
    .where(
      and(
        eq(quickNotes.id, id),
        eq(quickNotes.userId, userId),
        isNull(quickNotes.deletedAt)
      )
    )
  if (!row) throw notFound("Doc")
  return (await toDtos([row]))[0]!
}

export async function restoreDoc(userId: string, id: string) {
  const [row] = await db
    .update(quickNotes)
    .set({ deletedAt: null })
    .where(
      and(
        eq(quickNotes.id, id),
        eq(quickNotes.userId, userId),
        isNotNull(quickNotes.deletedAt)
      )
    )
    .returning()
  if (!row) throw notFound("Doc")
  return (await toDtos([row]))[0]!
}

export async function listDocVersions(userId: string, id: string) {
  await getDoc(userId, id)
  return db
    .select({
      revision: docVersions.revision,
      title: docVersions.title,
      createdAt: docVersions.createdAt,
    })
    .from(docVersions)
    .where(eq(docVersions.docId, id))
    .orderBy(desc(docVersions.revision))
    .limit(50)
}

export async function restoreDocVersion(
  userId: string,
  id: string,
  revision: number,
  expectedRevision: number
) {
  await getDoc(userId, id)
  const [version] = await db
    .select()
    .from(docVersions)
    .where(and(eq(docVersions.docId, id), eq(docVersions.revision, revision)))
  if (!version) throw notFound("Version")
  return updateQuickNote(userId, id, {
    title: version.title,
    bodyJson: version.bodyJson,
    bodyText: version.bodyText,
    expectedRevision,
  })
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
