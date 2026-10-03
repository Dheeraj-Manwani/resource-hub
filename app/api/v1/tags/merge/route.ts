import { json, parseBody, route } from "@/lib/server/api"
import { mergeTags } from "@/lib/server/dal/tags"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { mergeTagsSchema } from "@/lib/validation/tags"

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { sourceIds, targetId } = await parseBody(request, mergeTagsSchema)
  await mergeTags(user.id, sourceIds, targetId)
  return json({ ok: true })
})
