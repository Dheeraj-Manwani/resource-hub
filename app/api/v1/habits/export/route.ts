import { route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { rateLimit } from "@/lib/server/rate-limit"
import { buildHabitExport } from "@/lib/server/dal/habit-export"
import { habitsCsv } from "@/lib/habits/csv"
export const GET = route(async () => {
  const user = await requireApiUser()
  await rateLimit(`habit-export:${user.id}`, { limit: 5, windowSeconds: 300 })
  return new Response(habitsCsv(await buildHabitExport(user.id)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="habits-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
})
