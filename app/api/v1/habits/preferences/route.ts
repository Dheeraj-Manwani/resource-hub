import { route, json, parseBody } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import {
  getHabitPreferences,
  updateHabitPreferences,
} from "@/lib/server/dal/habit-rewards"
import { motivationPreferencesSchema } from "@/lib/habits/motivation"
export const GET = route(async () =>
  json(await getHabitPreferences((await requireApiUser()).id))
)
export const PATCH = route(async (request) => {
  const user = await requireApiUser()
  const patch = await parseBody(request, motivationPreferencesSchema)
  return json(await updateHabitPreferences(user.id, patch))
})
