import { route, json, parseBody, parseId } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { timerCommandSchema } from "@/lib/habits/timer"
import { commandHabitTimer } from "@/lib/server/dal/habit-timer"
export const PATCH = route(
  async (request, context: RouteContext<"/api/v1/habits/timer/[id]">) => {
    const user = await requireApiUser()
    await writeLimit(user.id)
    const { id } = await context.params
    return json(
      await commandHabitTimer(
        user.id,
        parseId(id),
        await parseBody(request, timerCommandSchema)
      )
    )
  }
)
