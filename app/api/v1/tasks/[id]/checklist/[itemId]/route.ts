import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { deleteChecklistItem, updateChecklistItem } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { updateChecklistItemSchema } from "@/lib/validation/tasks"

type Ctx = RouteContext<"/api/v1/tasks/[id]/checklist/[itemId]">

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { id, itemId } = await ctx.params
  const taskId = parseId(id)
  const patch = await parseBody(request, updateChecklistItemSchema)
  const task = await updateChecklistItem(user.id, taskId, parseId(itemId), patch)
  if (!task) throw notFound("Task")
  return json(task)
})

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { id, itemId } = await ctx.params
  const task = await deleteChecklistItem(user.id, parseId(id), parseId(itemId))
  if (!task) throw notFound("Task")
  return json(task)
})
