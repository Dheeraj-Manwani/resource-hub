import { json, route } from "@/lib/server/api"
import { smartFilterCounts } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"

export const GET = route(async () => {
  const user = await requireApiUser()
  return json(await smartFilterCounts(user.id))
})
