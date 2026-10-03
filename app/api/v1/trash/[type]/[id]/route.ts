import { badRequest, notFound, parseId, route } from "@/lib/server/api"
import {
  permanentlyDeleteProject,
  permanentlyDeleteResource,
  permanentlyDeleteTask,
} from "@/lib/server/dal/trash"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"

type Ctx = RouteContext<"/api/v1/trash/[type]/[id]">

const DELETERS = {
  resource: permanentlyDeleteResource,
  task: permanentlyDeleteTask,
  project: permanentlyDeleteProject,
} as const

function parseType(type: string) {
  if (type !== "resource" && type !== "task" && type !== "project")
    throw badRequest("Unknown trash entity type")
  return type
}

/** Permanent delete. */
export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { type, id: rawId } = await ctx.params
  const entityType = parseType(type)
  const id = parseId(rawId)
  if (!(await DELETERS[entityType](user.id, id))) throw notFound()
  return new Response(null, { status: 204 })
})
