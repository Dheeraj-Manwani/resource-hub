import { route, json, parseQuery } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { habitRangeSchema } from "@/lib/habits/planning"
import { habitCalendar } from "@/lib/server/dal/habit-planning"
export const GET = route(async (request) => {
  const user = await requireApiUser(),
    query = parseQuery(request, habitRangeSchema)
  return json(await habitCalendar(user.id, query.from, query.to))
})
