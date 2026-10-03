import { badRequest, json, parseBody, parseId, route } from "@/lib/server/api"
import { addReminder } from "@/lib/server/dal/reminders"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { createReminderSchema } from "@/lib/validation/reminders"

type Ctx = RouteContext<"/api/v1/tasks/[id]/reminders">

export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { offsetMinutes } = await parseBody(request, createReminderSchema)
  const reminder = await addReminder(user.id, id, offsetMinutes)
  if (!reminder) throw badRequest("Task not found")
  return json(reminder, { status: 201 })
})
