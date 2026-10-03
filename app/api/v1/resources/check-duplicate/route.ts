import { z } from "zod"

import { normalizeUrl } from "@/lib/resources/detect"
import { json, parseQuery, route } from "@/lib/server/api"
import { findDuplicate } from "@/lib/server/dal/resources"
import { requireApiUser } from "@/lib/server/dal/session"

const querySchema = z.object({ url: z.string().min(1).max(4_000) })

export const GET = route(async (request) => {
  const user = await requireApiUser()
  const { url } = parseQuery(request, querySchema)
  const normalized = normalizeUrl(url)
  const duplicate = normalized ? await findDuplicate(user.id, normalized) : null
  return json({ duplicate })
})
