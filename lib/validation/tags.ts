import { z } from "zod"

export const renameTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
})

export const setTagColorSchema = z.object({
  color: z.string().max(20).nullable(),
})

export const mergeTagsSchema = z.object({
  sourceIds: z.array(z.uuid()).min(1).max(50),
  targetId: z.uuid(),
})
