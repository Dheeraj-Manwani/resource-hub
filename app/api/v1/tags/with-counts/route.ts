import { json, route } from "@/lib/server/api"
import { listTagsWithCounts } from "@/lib/server/dal/tags"
import { requireApiUser } from "@/lib/server/dal/session"

export const GET = route(async () => {
  const user = await requireApiUser()
  return json({ items: await listTagsWithCounts(user.id) })
})
