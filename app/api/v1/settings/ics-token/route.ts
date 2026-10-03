import { json, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { regenerateIcsToken } from "@/lib/server/dal/settings"
import { writeLimit } from "@/lib/server/rate-limit"

/** Issues a new ICS subscribe token, revoking the previous one. */
export const POST = route(async () => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const icsToken = await regenerateIcsToken(user.id)
  return json({ icsToken })
})
