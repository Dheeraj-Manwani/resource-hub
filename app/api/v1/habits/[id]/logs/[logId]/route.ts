import { route, json, parseBody, parseId } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { changeHabitLog } from "@/lib/server/dal/habits"
import { deleteHabitLogSchema, editHabitLogSchema } from "@/lib/habits/model"
export const PATCH = route(
  async (
    request,
    context: RouteContext<"/api/v1/habits/[id]/logs/[logId]">
  ) => {
    const user = await requireApiUser()
    await writeLimit(user.id)
    const { id, logId } = await context.params
    const input = await parseBody(
      request,
      editHabitLogSchema.or(deleteHabitLogSchema)
    )
    return json(
      await changeHabitLog(user.id, parseId(id), parseId(logId), input)
    )
  }
)
