import { badRequest, json, notFound, parseId, route } from "@/lib/server/api"
import { restoreProject, restoreResource, restoreTask } from "@/lib/server/dal/trash"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"

type Ctx = RouteContext<"/api/v1/trash/[type]/[id]/restore">

const RESTORERS = {
  resource: restoreResource,
  task: restoreTask,
  project: restoreProject,
} as const

function parseType(type: string) {
  if (type !== "resource" && type !== "task" && type !== "project")
    throw badRequest("Unknown trash entity type")
  return type
}

export const POST = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { type, id: rawId } = await ctx.params
  const entityType = parseType(type)
  const id = parseId(rawId)
  if (!(await RESTORERS[entityType](user.id, id))) throw notFound()
  return json({ ok: true })
})
