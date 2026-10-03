import { json, parseBody, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { createQuickNote, listQuickNotes } from "@/lib/server/dal/quick-notes"
import { writeLimit } from "@/lib/server/rate-limit"
import { createQuickNoteSchema } from "@/lib/validation/quick-notes"

export const GET = route(async () => {
  const user = await requireApiUser()
  return json({ items: await listQuickNotes(user.id) })
})

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, createQuickNoteSchema)
  return json(await createQuickNote(user.id, input), { status: 201 })
})
