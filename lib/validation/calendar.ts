import { z } from "zod"

import { taskPrioritySchema, taskStatusSchema } from "./tasks"

export const calendarQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  projectId: z.uuid().optional(),
  includeDescendants: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  tag: z.uuid().optional(),
  status: taskStatusSchema.optional(),
})
export type CalendarQuery = z.infer<typeof calendarQuerySchema>

export const occurrenceEditSchema = z.object({
  /** Which occurrence instant is being edited (ignored when `scope: "all"`). */
  occurrenceAt: z.iso.datetime().optional(),
  scope: z.enum(["this", "following", "all"]),
  patch: z
    .object({
      title: z.string().trim().min(1).max(500).optional(),
      status: taskStatusSchema.optional(),
      priority: taskPrioritySchema.optional(),
      startAt: z.iso.datetime().nullable().optional(),
      dueAt: z.iso.datetime().nullable().optional(),
      startDate: z.iso.date().nullable().optional(),
      dueDate: z.iso.date().nullable().optional(),
      allDay: z.boolean().optional(),
      projectId: z.uuid().nullable().optional(),
    })
    .strict(),
})
export type OccurrenceEditInput = z.infer<typeof occurrenceEditSchema>

export const recurrenceBuilderSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365).optional(),
  byweekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: z.iso.datetime().nullable().optional(),
})
export type RecurrenceBuilderInput = z.infer<typeof recurrenceBuilderSchema>
