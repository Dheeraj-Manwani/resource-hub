import { json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { deleteTag, renameTag, setTagColor } from "@/lib/server/dal/tags"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { renameTagSchema, setTagColorSchema } from "@/lib/validation/tags"
import { z } from "zod"

type Ctx = RouteContext<"/api/v1/tags/[id]">

const patchSchema = z.union([renameTagSchema, setTagColorSchema])

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const patch = await parseBody(request, patchSchema)
  const tag =
    "name" in patch
      ? await renameTag(user.id, id, patch.name)
      : await setTagColor(user.id, id, patch.color)
  if (!tag) throw notFound("Tag")
  return json(tag)
})

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  if (!(await deleteTag(user.id, id))) throw notFound("Tag")
  return new Response(null, { status: 204 })
})
