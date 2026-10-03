import { badRequest, json, parseBody, route } from "@/lib/server/api"
import { createProject } from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { createProjectSchema } from "@/lib/validation/projects"

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, createProjectSchema)
  const project = await createProject(user.id, input)
  if (!project) throw badRequest("Parent project not found")
  return json(project, { status: 201 })
})
