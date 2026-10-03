import { json, parseQuery, route } from "@/lib/server/api"
import { rateLimit } from "@/lib/server/rate-limit"
import { search } from "@/lib/server/dal/search"
import { requireApiUser } from "@/lib/server/dal/session"
import { searchQuerySchema } from "@/lib/validation/search"

export const GET = route(async (request) => {
  const user = await requireApiUser()
  await rateLimit(`search:${user.id}`, { limit: 60, windowSeconds: 60 })
  const query = parseQuery(request, searchQuerySchema)
  return json(await search(user.id, query))
})
