import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import {
  getResource,
  softDeleteResource,
  updateResource,
} from "@/lib/server/dal/resources"
import { requireApiUser } from "@/lib/server/dal/session"
import { scheduleMetadata } from "@/lib/server/metadata-runner"
import { writeLimit } from "@/lib/server/rate-limit"
import { updateResourceSchema } from "@/lib/validation/resources"

type Ctx = RouteContext<"/api/v1/resources/[id]">

export const GET = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  const id = parseId((await ctx.params).id)
  const resource = await getResource(user.id, id)
  if (!resource) throw notFound()
  return json(resource)
})

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const patch = await parseBody(request, updateResourceSchema)
  const result = await updateResource(user.id, id, patch)
  if (!result) throw notFound()
  if (result.refetchMetadata) scheduleMetadata([id])
  return json(result.dto)
})

/** Soft delete (restorable from Trash in Phase 6). */
export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  if (!(await softDeleteResource(user.id, id))) throw notFound()
  return new Response(null, { status: 204 })
})
