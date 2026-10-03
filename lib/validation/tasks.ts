import { z } from "zod"

import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks/types"

export const taskStatusSchema = z.enum(TASK_STATUSES)
export const taskPrioritySchema = z.enum(TASK_PRIORITIES)

const tagNames = z.array(z.string().trim().min(1).max(50)).max(20)

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  projectId: z.uuid().nullable().optional(),
  descriptionJson: z.record(z.string(), z.unknown()).nullable().optional(),
  descriptionText: z.string().max(100_000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  startAt: z.iso.datetime().nullable().optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  allDay: z.boolean().optional(),
  tags: tagNames.optional(),
  resourceIds: z.array(z.uuid()).max(100).optional(),
})
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    projectId: z.uuid().nullable().optional(),
    descriptionJson: z.record(z.string(), z.unknown()).nullable().optional(),
    descriptionText: z.string().max(100_000).nullable().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    startAt: z.iso.datetime().nullable().optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    startDate: z.iso.date().nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
    allDay: z.boolean().optional(),
    archived: z.boolean().optional(),
    tags: tagNames.optional(),
  })
  .strict()
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

const boolParam = z.enum(["true", "false"]).transform((v) => v === "true")

export const SMART_FILTERS = [
  "today",
  "upcoming",
  "overdue",
  "no_date",
  "completed",
] as const
export type SmartFilter = (typeof SMART_FILTERS)[number]

export const listTasksQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  smartFilter: z.enum(SMART_FILTERS).optional(),
  projectId: z.uuid().optional(),
  includeDescendants: boolParam.optional(),
  tag: z.uuid().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  includeArchived: boolParam.optional(),
  sort: z.enum(["created", "updated", "due", "priority", "title", "sortKey"]).default("sortKey"),
  order: z.enum(["asc", "desc"]).default("asc"),
})
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>

export const moveTaskSchema = z
  .object({
    status: taskStatusSchema,
    beforeId: z.uuid().optional(),
    afterId: z.uuid().optional(),
  })
  .strict()
export type MoveTaskInput = z.infer<typeof moveTaskSchema>

export const createChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(500),
})

export const updateChecklistItemSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    done: z.boolean().optional(),
  })
  .strict()

export const reorderChecklistSchema = z.object({
  beforeId: z.uuid().optional(),
  afterId: z.uuid().optional(),
})

export const taskResourceIdsSchema = z.object({
  resourceIds: z.array(z.uuid()).min(1).max(100),
})

export const bulkTaskActionSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("status"),
      taskIds: z.array(z.uuid()).min(1).max(500),
      status: taskStatusSchema,
    }),
    z.object({
      action: z.literal("priority"),
      taskIds: z.array(z.uuid()).min(1).max(500),
      priority: taskPrioritySchema,
    }),
    z.object({
      action: z.literal("project"),
      taskIds: z.array(z.uuid()).min(1).max(500),
      projectId: z.uuid().nullable(),
    }),
    z.object({
      action: z.literal("tag"),
      taskIds: z.array(z.uuid()).min(1).max(500),
      tags: tagNames.min(1),
    }),
    z.object({
      action: z.literal("untag"),
      taskIds: z.array(z.uuid()).min(1).max(500),
      tags: tagNames.min(1),
    }),
    z.object({
      action: z.literal("delete"),
      taskIds: z.array(z.uuid()).min(1).max(500),
    }),
  ])
export type BulkTaskActionInput = z.infer<typeof bulkTaskActionSchema>
