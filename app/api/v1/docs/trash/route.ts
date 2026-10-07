import { z } from "zod"
import { json, parseBody, route } from "@/lib/server/api"
import { listQuickNotes, restoreDoc } from "@/lib/server/dal/quick-notes"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
export const GET = route(async () => {
  const user = await requireApiUser()
  return json({ items: await listQuickNotes(user.id, { trash: true }) })
})
export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { id } = await parseBody(request, z.object({ id: z.uuid() }))
  return json(await restoreDoc(user.id, id))
})
