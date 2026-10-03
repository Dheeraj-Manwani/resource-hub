import { notFound, parseId, route } from "@/lib/server/api"
import { deleteReminder } from "@/lib/server/dal/reminders"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"

type Ctx = RouteContext<"/api/v1/tasks/[id]/reminders/[reminderId]">

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { id, reminderId } = await ctx.params
  if (!(await deleteReminder(user.id, parseId(id), parseId(reminderId)))) throw notFound("Task")
  return new Response(null, { status: 204 })
})
