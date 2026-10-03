import { badRequest, json, parseBody, parseQuery, route } from "@/lib/server/api"
import { getDescendantIds } from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"
import { createQuickNote, listQuickNotes } from "@/lib/server/dal/quick-notes"
import { writeLimit } from "@/lib/server/rate-limit"
import {
  createQuickNoteSchema,
  listQuickNotesQuerySchema,
} from "@/lib/validation/quick-notes"

export const GET = route(async (request) => {
  const user = await requireApiUser()
  const query = parseQuery(request, listQuickNotesQuerySchema)
  let projectIds: string[] | undefined
  if (query.projectId) {
    projectIds = query.includeDescendants
      ? ((await getDescendantIds(user.id, query.projectId)) ?? [query.projectId])
      : [query.projectId]
  }
  return json({ items: await listQuickNotes(user.id, { projectIds }) })
})

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, createQuickNoteSchema)
  const note = await createQuickNote(user.id, input)
  if (!note) throw badRequest("Project not found")
  return json(note, { status: 201 })
})
