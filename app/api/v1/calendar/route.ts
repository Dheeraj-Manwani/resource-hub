import { badRequest, json, parseQuery, route } from "@/lib/server/api"
import { getCalendarOccurrences } from "@/lib/server/dal/calendar"
import { getDescendantIds } from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"
import { calendarQuerySchema } from "@/lib/validation/calendar"

const MAX_RANGE_DAYS = 400

export const GET = route(async (request) => {
  const user = await requireApiUser()
  const query = parseQuery(request, calendarQuerySchema)
  const from = new Date(query.from)
  const to = new Date(query.to)
  if (to.getTime() <= from.getTime()) throw badRequest("`to` must be after `from`")
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw badRequest(`Range can't exceed ${MAX_RANGE_DAYS} days`)
  }

  let projectIds: string[] | undefined
  if (query.projectId) {
    projectIds = query.includeDescendants
      ? (await getDescendantIds(user.id, query.projectId)) ?? [query.projectId]
      : [query.projectId]
  }

  const items = await getCalendarOccurrences(
    user.id,
    { from, to },
    { projectIds, tag: query.tag, status: query.status }
  )
  return json({ items })
})
