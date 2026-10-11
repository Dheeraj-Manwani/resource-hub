import { route, json } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { dueHabitReminders } from "@/lib/server/dal/habit-planning"
export const GET = route(async () =>
  json({ items: await dueHabitReminders((await requireApiUser()).id) })
)
