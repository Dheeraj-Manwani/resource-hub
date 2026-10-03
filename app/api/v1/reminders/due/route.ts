import { json, route } from "@/lib/server/api"
import { dueReminders } from "@/lib/server/dal/reminders"
import { requireApiUser } from "@/lib/server/dal/session"

export const GET = route(async () => {
  const user = await requireApiUser()
  const items = await dueReminders(user.id, new Date())
  return json({ items })
})
