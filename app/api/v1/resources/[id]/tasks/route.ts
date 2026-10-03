import { json, parseId, route } from "@/lib/server/api"
import { tasksForResource } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"

type Ctx = RouteContext<"/api/v1/resources/[id]/tasks">

export const GET = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  const id = parseId((await ctx.params).id)
  const items = await tasksForResource(user.id, id)
  return json({ items })
})
