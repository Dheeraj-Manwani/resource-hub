import { json, notFound, parseId, parseQuery, route } from "@/lib/server/api"
import { getDescendantIds } from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"
import { taskProgressForProjects } from "@/lib/server/dal/tasks"
import { z } from "zod"

type Ctx = RouteContext<"/api/v1/projects/[id]/tasks-progress">

const querySchema = z.object({
  includeDescendants: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
})

export const GET = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  const id = parseId((await ctx.params).id)
  const { includeDescendants } = parseQuery(request, querySchema)
  const projectIds = includeDescendants ? await getDescendantIds(user.id, id) : [id]
  if (!projectIds) throw notFound("Project")
  return json(await taskProgressForProjects(user.id, projectIds))
})
