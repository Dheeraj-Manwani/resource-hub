import { badRequest, json, notFound, parseBody, parseId, route } from "@/lib/server/api"
import { editOccurrence } from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { occurrenceEditSchema } from "@/lib/validation/calendar"

type Ctx = RouteContext<"/api/v1/tasks/[id]/occurrences">

/** Edits (or completes) one occurrence of a recurring task — see
 * `editOccurrence` for what each `scope` does. `occurrenceAt` is required
 * except when `scope: "all"` (a normal whole-task update). */
export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const { occurrenceAt, scope, patch } = await parseBody(request, occurrenceEditSchema)
  if (scope !== "all" && !occurrenceAt) throw badRequest("occurrenceAt is required for this scope")

  const result = await editOccurrence(
    user.id,
    id,
    occurrenceAt ? new Date(occurrenceAt) : new Date(0),
    scope,
    patch
  )
  if (!result.ok) throw notFound("Task")
  return json(result.dto)
})
