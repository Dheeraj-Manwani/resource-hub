import { route, json, parseBody, parseId } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { setHabitStatus } from "@/lib/server/dal/habits"
import { statusHabitSchema } from "@/lib/habits/model"
export const PATCH = route(
  async (request, context: RouteContext<"/api/v1/habits/[id]/status">) => {
    const user = await requireApiUser()
    await writeLimit(user.id)
    const { id } = await context.params
    const input = await parseBody(request, statusHabitSchema)
    return json(
      await setHabitStatus(
        user.id,
        parseId(id),
        input.status,
        input.expectedRevision
      )
    )
  }
)
