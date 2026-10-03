import { route } from "@/lib/server/api"
import { tasksForIcs } from "@/lib/server/dal/calendar"
import { userIdForIcsToken } from "@/lib/server/dal/settings"
import { buildIcs } from "@/lib/tasks/ics"

type Ctx = RouteContext<"/api/calendar/[token]">

/**
 * Public subscribable feed — the token itself is the credential (no
 * session), matching how every calendar app (Google, Apple, Outlook)
 * expects a `webcal://`/`https://` ICS subscribe URL to work. The token is
 * revocable (and regenerable) from Settings.
 */
export const GET = route(async (_request, ctx: Ctx) => {
  const { token: raw } = await ctx.params
  const token = raw.replace(/\.ics$/i, "")
  const userId = await userIdForIcsToken(token)
  if (!userId) return new Response("Not found", { status: 404 })

  const tasks = await tasksForIcs(userId)
  const ics = buildIcs(tasks, "My tasks")
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tasks.ics"',
      "Cache-Control": "private, max-age=300",
    },
  })
})
