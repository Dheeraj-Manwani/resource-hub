import { json, route } from "@/lib/server/api"
import { seedDemoData } from "@/lib/server/demo"
import { requireApiUser } from "@/lib/server/dal/session"
import { rateLimit } from "@/lib/server/rate-limit"

/** "Load demo data" button in empty states. */
export const POST = route(async () => {
  const user = await requireApiUser()
  await rateLimit(`demo:${user.id}`, { limit: 3, windowSeconds: 300 })
  const created = await seedDemoData(user.id)
  return json({ count: created.length }, { status: 201 })
})
