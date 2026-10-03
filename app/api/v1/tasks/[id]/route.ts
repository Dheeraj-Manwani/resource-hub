import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { getTask, softDeleteTask, updateTask } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { updateTaskSchema } from "@/lib/validation/tasks"

type Ctx = RouteContext<"/api/v1/tasks/[id]">

export const GET = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  const id = parseId((await ctx.params).id)
  const task = await getTask(user.id, id)
  if (!task) throw notFound("Task")
  return json(task)
})

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const patch = await parseBody(request, updateTaskSchema)
  const task = await updateTask(user.id, id, patch)
  if (!task) throw notFound("Task")
  return json(task)
})

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  if (!(await softDeleteTask(user.id, id))) throw notFound("Task")
  return new Response(null, { status: 204 })
})
