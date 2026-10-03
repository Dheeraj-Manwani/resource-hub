import {
  json,
  notFound,
  parseBody,
  parseId,
  parseQuery,
  route,
} from "@/lib/server/api"
import {
  deleteProject,
  getProjectWithAncestors,
  updateProject,
} from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import {
  deleteProjectQuerySchema,
  updateProjectSchema,
} from "@/lib/validation/projects"

type Ctx = RouteContext<"/api/v1/projects/[id]">

export const GET = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  const id = parseId((await ctx.params).id)
  const result = await getProjectWithAncestors(user.id, id)
  if (!result) throw notFound("Project")
  return json(result)
})

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const patch = await parseBody(request, updateProjectSchema)
  const project = await updateProject(user.id, id, patch)
  if (!project) throw notFound("Project")
  return json(project)
})

/** Soft delete. `?mode=subtree` removes the project and all descendants;
 * `?mode=reparent` moves direct children up one level first. Resources are
 * never deleted, only unfiled from the removed project(s). */
export const DELETE = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { mode } = parseQuery(request, deleteProjectQuerySchema)
  if (!(await deleteProject(user.id, id, mode)))
    throw notFound("Project")
  return new Response(null, { status: 204 })
})
