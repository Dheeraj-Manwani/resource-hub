import { json, notFound, parseId, route } from "@/lib/server/api"
import { getTaskRow, updateTask } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"

type Ctx = RouteContext<"/api/v1/tasks/[id]/archive">

/** Toggles archived state. */
export const POST = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const existing = await getTaskRow(user.id, id)
  if (!existing) throw notFound("Task")
  const task = await updateTask(user.id, id, { archived: !existing.archivedAt })
  if (!task) throw notFound("Task")
  return json(task)
})
