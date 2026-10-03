import { badRequest, json, parseBody, parseQuery, route } from "@/lib/server/api"
import { createTask, listTasks } from "@/lib/server/dal/tasks"
import { getDescendantIds } from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { createTaskSchema, listTasksQuerySchema } from "@/lib/validation/tasks"

export const GET = route(async (request) => {
  const user = await requireApiUser()
  const query = parseQuery(request, listTasksQuerySchema)
  let projectIds: string[] | undefined
  if (query.projectId) {
    projectIds = query.includeDescendants
      ? (await getDescendantIds(user.id, query.projectId)) ?? [query.projectId]
      : [query.projectId]
  }
  const page = await listTasks(user.id, query, { projectIds })
  return json(page)
})

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, createTaskSchema)
  const task = await createTask(user.id, input)
  if (!task) throw badRequest("Project not found")
  return json(task, { status: 201 })
})
