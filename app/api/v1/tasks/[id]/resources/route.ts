import { badRequest, json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { linkTaskResources, unlinkTaskResources } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { taskResourceIdsSchema } from "@/lib/validation/tasks"

type Ctx = RouteContext<"/api/v1/tasks/[id]/resources">

export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { resourceIds } = await parseBody(request, taskResourceIdsSchema)
  if (!(await linkTaskResources(user.id, id, resourceIds))) throw badRequest("Task not found")
  return json({ linked: resourceIds.length })
})

export const DELETE = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { resourceIds } = await parseBody(request, taskResourceIdsSchema)
  if (!(await unlinkTaskResources(user.id, id, resourceIds))) throw notFound("Task")
  return json({ unlinked: resourceIds.length })
})
