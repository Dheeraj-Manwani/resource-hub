import { ApiError, json, parseBody, parseId, route } from "@/lib/server/api"
import { moveProject } from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { moveProjectSchema } from "@/lib/validation/projects"

type Ctx = RouteContext<"/api/v1/projects/[id]/move">

export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const input = await parseBody(request, moveProjectSchema)
  const result = await moveProject(user.id, id, input)
  if (!result.ok) {
    if (result.reason === "cycle")
      throw new ApiError(
        400,
        "Can't move a project into itself or one of its own sub-projects",
        "cycle"
      )
    throw new ApiError(404, "Project not found", "not_found")
  }
  return json(result.dto)
})
