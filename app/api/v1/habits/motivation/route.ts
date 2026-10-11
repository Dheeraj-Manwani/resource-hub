import { route, json } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { habitMotivation } from "@/lib/server/dal/habit-motivation"
export const GET = route(async () => {
  const user = await requireApiUser()
  return json(await habitMotivation(user.id))
})
