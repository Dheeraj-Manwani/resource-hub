import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { dismissReminder } from "@/lib/server/dal/reminders"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { dismissReminderSchema } from "@/lib/validation/reminders"

type Ctx = RouteContext<"/api/v1/reminders/[id]/dismiss">

export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { occurrenceAt } = await parseBody(request, dismissReminderSchema)
  if (!(await dismissReminder(user.id, id, new Date(occurrenceAt)))) throw notFound("Reminder")
  return json({ dismissed: true })
})
