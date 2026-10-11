import { route, json, parseQuery } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { habitHistoryQuerySchema } from "@/lib/habits/history"
import { habitHistory } from "@/lib/server/dal/habit-history"
export const GET = route(async (request) => {
  const user = await requireApiUser(),
    query = parseQuery(request, habitHistoryQuerySchema)
  return json(
    await habitHistory(user.id, query.date, query.view, query.habitId)
  )
})
