import { z } from "zod"

import { resourceTypeSchema } from "./resources"

export const searchEntityTypes = ["resource", "task", "project", "tag"] as const

const boolParam = z.enum(["true", "false"]).transform((v) => v === "true")

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(searchEntityTypes).optional(),
  resourceType: resourceTypeSchema.optional(),
  tag: z.uuid().optional(),
  project: z.uuid().optional(),
  includeDescendants: boolParam.optional(),
  favorite: boolParam.optional(),
  linked: boolParam.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
