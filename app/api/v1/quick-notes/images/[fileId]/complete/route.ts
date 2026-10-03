import { json, parseId, route } from "@/lib/server/api"
import { completeQuickNoteImage } from "@/lib/server/dal/quick-notes"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"

type Ctx = RouteContext<"/api/v1/quick-notes/images/[fileId]/complete">

export const POST = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const fileId = parseId((await ctx.params).fileId)
  return json(await completeQuickNoteImage(user.id, fileId))
})
