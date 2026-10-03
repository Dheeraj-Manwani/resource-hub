import { z } from "zod"

import { RESOURCE_TYPES } from "@/lib/resources/types"

export const resourceTypeSchema = z.enum(RESOURCE_TYPES)

export const tagNamesSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(20, "At most 20 tags")

const projectIdsSchema = z.array(z.uuid()).max(20).optional()

export const createResourceSchema = z
  .object({
    url: z.string().trim().max(4_000).optional(),
    text: z.string().max(50_000).optional(),
    type: resourceTypeSchema.optional(),
    title: z.string().trim().max(500).optional(),
    notes: z.string().max(20_000).optional(),
    tags: tagNamesSchema.optional(),
    projectIds: projectIdsSchema,
  })
  .refine((v) => v.url || v.text, { message: "Provide a URL or some text" })

export type CreateResourceInput = z.infer<typeof createResourceSchema>

export const bulkCreateSchema = z.object({
  urls: z
    .array(z.string().trim().min(1).max(4_000))
    .min(1)
    .max(100, "At most 100 links at once"),
  tags: tagNamesSchema.optional(),
  projectIds: projectIdsSchema,
})

export const metadataOverrideSchema = z
  .object({
    description: z.string().max(2_000).optional(),
    image: z.url().max(4_000).optional(),
    author: z.string().max(200).optional(),
    siteName: z.string().max(200).optional(),
  })
  .strict()

export const updateResourceSchema = z
  .object({
    title: z.string().trim().max(500).nullable().optional(),
    notes: z.string().max(20_000).nullable().optional(),
    description: z.string().max(5_000).nullable().optional(),
    type: resourceTypeSchema.optional(),
    tags: tagNamesSchema.optional(),
    isFavorite: z.boolean().optional(),
    isReviewed: z.boolean().optional(),
    embedStatus: z.enum(["unknown", "ok", "unavailable"]).optional(),
    metadataOverride: metadataOverrideSchema.nullable().optional(),
    bodyJson: z.record(z.string(), z.unknown()).nullable().optional(),
    bodyText: z.string().max(100_000).nullable().optional(),
  })
  .strict()

export type UpdateResourceInput = z.infer<typeof updateResourceSchema>

const boolParam = z.enum(["true", "false"]).transform((v) => v === "true")

export const listResourcesQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  type: resourceTypeSchema.optional(),
  tag: z.uuid().optional(),
  favorite: boolParam.optional(),
  reviewed: boolParam.optional(),
  /** Resources not filed into any project. */
  unsorted: boolParam.optional(),
  /** Has at least one (true) or no (false) linked task. */
  hasTasks: boolParam.optional(),
  /** Scope to one project (and, if set, its descendants). */
  projectId: z.uuid().optional(),
  includeDescendants: boolParam.optional(),
  sort: z.enum(["created", "updated", "title"]).default("created"),
  order: z.enum(["asc", "desc"]).default("desc"),
})

export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>

export const UPLOAD_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const

export const UPLOAD_FILE_MIME = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const

export const UPLOAD_MIME: readonly string[] = [
  ...UPLOAD_IMAGE_MIME,
  ...UPLOAD_FILE_MIME,
]

export const createUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mime: z
    .string()
    .refine((m) => UPLOAD_MIME.includes(m), "This file type isn't supported"),
  size: z.number().int().positive(),
  purpose: z.enum(["resource", "thumbnail"]).default("resource"),
  resourceId: z.uuid().optional(),
})

export const completeUploadSchema = z.object({
  title: z.string().trim().max(500).optional(),
  tags: tagNamesSchema.optional(),
  projectIds: projectIdsSchema,
})

export const captureSchema = z
  .object({
    url: z.string().trim().max(4_000).optional(),
    text: z.string().max(50_000).optional(),
    title: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.url || v.text, { message: "Nothing to capture" })
