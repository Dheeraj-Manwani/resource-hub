import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { deleteQuickNote, updateQuickNote } from "@/lib/server/dal/quick-notes"
import { writeLimit } from "@/lib/server/rate-limit"
import { updateQuickNoteSchema } from "@/lib/validation/quick-notes"

type Ctx = RouteContext<"/api/v1/quick-notes/[id]">

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const patch = await parseBody(request, updateQuickNoteSchema)
  return json(await updateQuickNote(user.id, id, patch))
})

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  if (!(await deleteQuickNote(user.id, id))) throw notFound("Note")
  return new Response(null, { status: 204 })
})
