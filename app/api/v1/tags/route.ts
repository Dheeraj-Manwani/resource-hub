import { z } from "zod"

import { json, parseBody, parseQuery, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { createTag, searchTags } from "@/lib/server/dal/tags"
import { writeLimit } from "@/lib/server/rate-limit"

const querySchema = z.object({
  q: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const GET = route(async (request) => {
  const user = await requireApiUser()
  const { q, limit } = parseQuery(request, querySchema)
  return json({ items: await searchTags(user.id, q, limit) })
})

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { name } = await parseBody(
    request,
    z.object({ name: z.string().trim().min(1).max(50) })
  )
  return json(await createTag(user.id, name), { status: 201 })
})
