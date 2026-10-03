import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { reorderChecklistItem } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { reorderChecklistSchema } from "@/lib/validation/tasks"

type Ctx = RouteContext<"/api/v1/tasks/[id]/checklist/[itemId]/move">

export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { id, itemId } = await ctx.params
  const anchors = await parseBody(request, reorderChecklistSchema)
  const task = await reorderChecklistItem(user.id, parseId(id), parseId(itemId), anchors)
  if (!task) throw notFound("Task")
  return json(task)
})
