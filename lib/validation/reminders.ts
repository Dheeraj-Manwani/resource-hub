import { z } from "zod"

export const createReminderSchema = z.object({
  offsetMinutes: z.number().int().min(0).max(60 * 24 * 30),
})
export type CreateReminderInput = z.infer<typeof createReminderSchema>

export const dismissReminderSchema = z.object({
  /** The specific occurrence instant to dismiss this reminder for. */
  occurrenceAt: z.iso.datetime(),
})
