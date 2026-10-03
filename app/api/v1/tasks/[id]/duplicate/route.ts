import { json, notFound, parseId, route } from "@/lib/server/api"
import { duplicateTask } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"

type Ctx = RouteContext<"/api/v1/tasks/[id]/duplicate">

export const POST = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const task = await duplicateTask(user.id, id)
  if (!task) throw notFound("Task")
  return json(task, { status: 201 })
})
