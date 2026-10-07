import { z } from "zod"

import { UPLOAD_IMAGE_MIME } from "@/lib/validation/resources"

export const listQuickNotesQuerySchema = z.object({
  projectId: z.uuid().optional(),
  includeDescendants: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
})

export const updateQuickNoteSchema = z.object({
  projectId: z.uuid().nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  bodyJson: z.unknown().optional(),
  bodyText: z.string().nullable().optional(),
  kind: z.enum(["text", "spreadsheet"]).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
})

export const createQuickNoteSchema = updateQuickNoteSchema.extend({
  clientId: z.uuid().optional(),
})

export const createQuickNoteImageSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mime: z
    .string()
    .refine(
      (m) => (UPLOAD_IMAGE_MIME as readonly string[]).includes(m),
      "Only images can be pasted into a note"
    ),
  size: z.number().int().positive(),
})

export const linkPreviewSchema = z.object({
  url: z.string().trim().max(2000),
})
