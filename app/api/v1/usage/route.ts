import { json, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { usageSummary } from "@/lib/server/quotas"

export const GET = route(async () => {
  const user = await requireApiUser()
  return json(await usageSummary(user.id))
})
