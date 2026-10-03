import { json, route } from "@/lib/server/api"
import { getOverview } from "@/lib/server/dal/overview"
import { requireApiUser } from "@/lib/server/dal/session"

export const GET = route(async () => {
  const user = await requireApiUser()
  return json(await getOverview(user.id))
})
