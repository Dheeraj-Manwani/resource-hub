import { z } from "zod"

import { json, parseBody, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { createToken, listTokens } from "@/lib/server/dal/tokens"
import { rateLimit } from "@/lib/server/rate-limit"

export const GET = route(async () => {
  const user = await requireApiUser()
  return json({ items: await listTokens(user.id) })
})

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await rateLimit(`tokens:${user.id}`, { limit: 10, windowSeconds: 60 })
  const { name } = await parseBody(
    request,
    z.object({ name: z.string().trim().min(1).max(80) })
  )
  return json(await createToken(user.id, name), { status: 201 })
})
