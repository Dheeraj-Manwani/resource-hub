import { route } from "@/lib/server/api"
import { tasksForIcs } from "@/lib/server/dal/calendar"
import { requireApiUser } from "@/lib/server/dal/session"
import { buildIcs } from "@/lib/tasks/ics"

/** One-off authenticated `.ics` download (vs. the public token feed, which
 * is for ongoing calendar-app subscriptions). */
export const GET = route(async () => {
  const user = await requireApiUser()
  const tasks = await tasksForIcs(user.id)
  const ics = buildIcs(tasks, "My tasks")
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tasks.ics"',
    },
  })
})
