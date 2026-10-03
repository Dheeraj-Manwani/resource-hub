import { json, parseBody, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { rateLimit } from "@/lib/server/rate-limit"
import { createManyFromUrls } from "@/lib/server/resource-service"
import { bulkCreateSchema } from "@/lib/validation/resources"

/** Creates many link resources at once; metadata is fetched after responding. */
export const POST = route(async (request) => {
  const user = await requireApiUser()
  await rateLimit(`bulk:${user.id}`, { limit: 20, windowSeconds: 60 })
  const { urls, tags } = await parseBody(request, bulkCreateSchema)
  const result = await createManyFromUrls(user.id, urls, tags)
  return json(result, { status: 201 })
})
