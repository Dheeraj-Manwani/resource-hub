import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { moveTask } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { moveTaskSchema } from "@/lib/validation/tasks"

type Ctx = RouteContext<"/api/v1/tasks/[id]/move">

/** Board DnD: moves a task into `status` at a fractional sort position
 * among that column's siblings (also the order shared with the list view). */
export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const input = await parseBody(request, moveTaskSchema)
  const result = await moveTask(user.id, id, input)
  if (!result.ok) throw notFound("Task")
  return json(result.dto)
})
