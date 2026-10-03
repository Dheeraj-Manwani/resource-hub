import "server-only"

import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { files, resources } from "@/lib/db/schema"
import { typeFromMime } from "@/lib/resources/detect"
import { ApiError, badRequest, notFound } from "@/lib/server/api"
import {
  createPendingFile,
  discardOldThumbnails,
  getUserFile,
  markFileReady,
  setResourceThumbnail,
  storeGeneratedFile,
} from "@/lib/server/dal/files"
import {
  getResource,
  getResourceRow,
  insertResources,
} from "@/lib/server/dal/resources"
import { makeThumbnail } from "@/lib/server/images"
import { extractPdfText } from "@/lib/server/pdf"
import { assertResourceCreationQuota, assertStorageQuota } from "@/lib/server/quotas"
import {
  deleteObject,
  getObjectBytes,
  headObject,
  presignPut,
  uploadLimits,
} from "@/lib/server/r2"
import {
  completeUploadSchema,
  createUploadSchema,
  UPLOAD_IMAGE_MIME,
} from "@/lib/validation/resources"

const isImage = (mime: string) =>
  (UPLOAD_IMAGE_MIME as readonly string[]).includes(mime)

/** Validates the request, creates a pending `files` row and a presigned PUT. */
export async function startUpload(
  userId: string,
  input: z.infer<typeof createUploadSchema>
) {
  const limits = uploadLimits()
  const max = isImage(input.mime) ? limits.imageBytes : limits.fileBytes
  if (input.size > max) {
    throw badRequest(
      `File is too large (max ${Math.round(max / 1024 / 1024)} MB)`
    )
  }
  await assertStorageQuota(userId, input.size)
  if (input.purpose === "thumbnail") {
    if (!isImage(input.mime)) throw badRequest("Thumbnails must be images")
    if (!input.resourceId || !(await getResourceRow(userId, input.resourceId)))
      throw notFound()
  }

  const file = await createPendingFile(userId, {
    name: input.name,
    mime: input.mime,
    size: input.size,
    role: input.purpose === "thumbnail" ? "thumbnail" : "original",
  })
  if (input.purpose === "thumbnail") {
    await db
      .update(files)
      .set({ resourceId: input.resourceId! })
      .where(eq(files.id, file.id))
  }
  const uploadUrl = await presignPut(file.r2Key, input.mime, input.size)
  return { fileId: file.id, uploadUrl, headers: { "Content-Type": input.mime } }
}

/**
 * Verifies the object landed with the promised size/type, generates a WebP
 * thumbnail for images, and creates the resource (or applies a custom
 * thumbnail to an existing one).
 */
export async function completeUpload(
  userId: string,
  fileId: string,
  input: z.infer<typeof completeUploadSchema>
) {
  const file = await getUserFile(userId, fileId)
  if (!file) throw notFound("Upload")
  if (file.status !== "pending")
    throw new ApiError(409, "Upload already completed", "conflict")

  const head = await headObject(file.r2Key)
  if (!head) throw badRequest("The file hasn't been uploaded yet")
  if (
    head.size !== file.size ||
    (head.contentType && head.contentType !== file.mime)
  ) {
    await deleteObject(file.r2Key).catch(() => {})
    await db.delete(files).where(eq(files.id, file.id))
    throw badRequest("Uploaded file doesn't match what was announced")
  }

  // Custom thumbnail for an existing resource (e.g. an Instagram screenshot).
  if (file.role === "thumbnail" && file.resourceId) {
    const row = await getResourceRow(userId, file.resourceId)
    if (!row) throw notFound()
    const thumb = await makeThumbnail(await getObjectBytes(file.r2Key))
    const thumbId = await storeGeneratedFile(userId, {
      resourceId: row.id,
      name: "thumbnail.webp",
      mime: "image/webp",
      data: thumb.data,
      width: thumb.width,
      height: thumb.height,
      role: "thumbnail",
    })
    await deleteObject(file.r2Key).catch(() => {})
    await db.delete(files).where(eq(files.id, file.id))
    await discardOldThumbnails(row.id, thumbId)
    await setResourceThumbnail(row.id, thumbId)
    await db
      .update(resources)
      .set({
        metadata: {
          ...row.metadata,
          thumbnailIsCustom: true,
          imageWidth: thumb.sourceWidth ?? undefined,
          imageHeight: thumb.sourceHeight ?? undefined,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(resources.id, row.id), eq(resources.userId, userId)))
    return getResource(userId, row.id)
  }

  await assertResourceCreationQuota(userId, 1)
  const type = typeFromMime(file.mime)
  let thumbnailFileId: string | null = null
  let width: number | null = null
  let height: number | null = null
  let extractedText: string | null = null
  if (type === "image") {
    try {
      const thumb = await makeThumbnail(await getObjectBytes(file.r2Key))
      width = thumb.sourceWidth
      height = thumb.sourceHeight
      thumbnailFileId = await storeGeneratedFile(userId, {
        resourceId: null,
        name: "thumbnail.webp",
        mime: "image/webp",
        data: thumb.data,
        width: thumb.width,
        height: thumb.height,
        role: "thumbnail",
      })
    } catch (error) {
      console.warn(
        "[uploads] thumbnail failed",
        file.id,
        (error as Error).message
      )
    }
  } else if (file.mime === "application/pdf") {
    extractedText = await extractPdfText(await getObjectBytes(file.r2Key))
  }
  await markFileReady(file.id, { width, height })

  const [resource] = await insertResources(userId, [
    {
      type,
      title: input.title || file.name.replace(/\.[^.]+$/, ""),
      metadata: {
        ...(width && height ? { imageWidth: width, imageHeight: height } : {}),
      },
      metadataStatus: "ok",
      thumbnailFileId,
      extractedText,
      tags: input.tags,
      projectIds: input.projectIds,
      fileIds: [file.id, ...(thumbnailFileId ? [thumbnailFileId] : [])],
    },
  ])
  return resource!
}
