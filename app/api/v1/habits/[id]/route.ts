import { route, json, parseBody, parseId } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { updateHabit } from "@/lib/server/dal/habits"
import { updateHabitSchema } from "@/lib/habits/model"
export const PATCH = route(
  async (request, context: RouteContext<"/api/v1/habits/[id]">) => {
    const user = await requireApiUser()
    await writeLimit(user.id)
    const { id } = await context.params
    return json(
      await updateHabit(
        user.id,
        parseId(id),
        await parseBody(request, updateHabitSchema)
      )
    )
  }
)
