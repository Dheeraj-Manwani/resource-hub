import { z } from "zod"

import {
  badRequest,
  json,
  notFound,
  parseBody,
  parseId,
  parseQuery,
  route,
} from "@/lib/server/api"
import { linkResources, unlinkResources } from "@/lib/server/dal/project-links"
import { getDescendantIds } from "@/lib/server/dal/projects"
import { listResources } from "@/lib/server/dal/resources"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { resourceIdsSchema } from "@/lib/validation/projects"
import {
  listResourcesQuerySchema,
  type ListResourcesQuery,
} from "@/lib/validation/resources"

type Ctx = RouteContext<"/api/v1/projects/[id]/resources">

const includeDescendantsSchema = z.object({
  includeDescendants: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
})

export const GET = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  const id = parseId((await ctx.params).id)
  const { includeDescendants } = parseQuery(request, includeDescendantsSchema)
  const query: ListResourcesQuery = parseQuery(
    request,
    listResourcesQuerySchema
  )
  const projectIds = includeDescendants
    ? await getDescendantIds(user.id, id)
    : [id]
  if (!projectIds) throw notFound("Project")
  const page = await listResources(user.id, query, { projectIds })
  return json(page)
})

export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { resourceIds } = await parseBody(request, resourceIdsSchema)
  if (!(await linkResources(user.id, id, resourceIds)))
    throw badRequest("Project or resources not found")
  return json({ linked: resourceIds.length })
})

export const DELETE = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { resourceIds } = await parseBody(request, resourceIdsSchema)
  if (!(await unlinkResources(user.id, id, resourceIds)))
    throw notFound("Project")
  return json({ unlinked: resourceIds.length })
})
