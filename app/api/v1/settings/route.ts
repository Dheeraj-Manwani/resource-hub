import { z } from "zod"

import { json, parseBody, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { getSettings, updateSettings } from "@/lib/server/dal/settings"
import { writeLimit } from "@/lib/server/rate-limit"

const patchSchema = z
  .object({
    timezone: z
      .string()
      .max(64)
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz })
          return true
        } catch {
          return false
        }
      }, "Unknown timezone"),
    weekStart: z.union([z.literal(0), z.literal(1)]),
    libraryView: z.enum(["grid", "list", "focus"]),
    calendarColorMode: z.enum(["project", "priority", "status"]),
    hasSeenOnboarding: z.boolean(),
  })
  .partial()
  .strict()

export const GET = route(async () => {
  const user = await requireApiUser()
  return json(await getSettings(user.id))
})

export const PATCH = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const patch = await parseBody(request, patchSchema)
  return json(await updateSettings(user.id, patch))
})
