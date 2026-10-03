import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { addChecklistItem } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { createChecklistItemSchema } from "@/lib/validation/tasks"

type Ctx = RouteContext<"/api/v1/tasks/[id]/checklist">

export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { title } = await parseBody(request, createChecklistItemSchema)
  const task = await addChecklistItem(user.id, id, title)
  if (!task) throw notFound("Task")
  return json(task, { status: 201 })
})
