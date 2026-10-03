import { z } from "zod"

import { PROJECT_COLORS } from "@/lib/projects/types"

export const projectColorSchema = z.enum(PROJECT_COLORS)

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.uuid().nullable().optional(),
  description: z.string().max(5_000).optional(),
  icon: z.string().trim().max(16).optional(),
  color: projectColorSchema.optional(),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5_000).nullable().optional(),
    icon: z.string().trim().max(16).nullable().optional(),
    color: projectColorSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const moveProjectSchema = z
  .object({
    parentId: z.uuid().nullable(),
    beforeId: z.uuid().optional(),
    afterId: z.uuid().optional(),
  })
  .strict()
export type MoveProjectInput = z.infer<typeof moveProjectSchema>

export const deleteProjectQuerySchema = z.object({
  mode: z.enum(["subtree", "reparent"]).default("subtree"),
})

export const resourceIdsSchema = z.object({
  resourceIds: z.array(z.uuid()).min(1).max(500),
})
export type ResourceIdsInput = z.infer<typeof resourceIdsSchema>

export const moveResourcesSchema = z
  .object({
    resourceIds: z.array(z.uuid()).min(1).max(500),
    from: z.uuid().nullable(),
    to: z.uuid().nullable(),
  })
  .strict()
export type MoveResourcesInput = z.infer<typeof moveResourcesSchema>

const tagNames = z.array(z.string().trim().min(1).max(50)).max(20)

export const bulkActionSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("link"),
      resourceIds: z.array(z.uuid()).min(1).max(500),
      projectId: z.uuid(),
    }),
    z.object({
      action: z.literal("unlink"),
      resourceIds: z.array(z.uuid()).min(1).max(500),
      projectId: z.uuid(),
    }),
    z.object({
      action: z.literal("move"),
      resourceIds: z.array(z.uuid()).min(1).max(500),
      from: z.uuid().nullable(),
      to: z.uuid().nullable(),
    }),
    z.object({
      action: z.literal("tag"),
      resourceIds: z.array(z.uuid()).min(1).max(500),
      tags: tagNames.min(1),
    }),
    z.object({
      action: z.literal("untag"),
      resourceIds: z.array(z.uuid()).min(1).max(500),
      tags: tagNames.min(1),
    }),
    z.object({
      action: z.literal("favorite"),
      resourceIds: z.array(z.uuid()).min(1).max(500),
      value: z.boolean(),
    }),
    z.object({
      action: z.literal("delete"),
      resourceIds: z.array(z.uuid()).min(1).max(500),
    }),
  ])
  .refine((v) => v.resourceIds.length > 0)
export type BulkActionInput = z.infer<typeof bulkActionSchema>
