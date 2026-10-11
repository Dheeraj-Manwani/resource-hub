import { route, json, parseBody, parseId } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { habitReminderActionSchema } from "@/lib/habits/planning"
import { actOnHabitReminder } from "@/lib/server/dal/habit-planning"
export const POST = route(
  async (request, context: RouteContext<"/api/v1/habits/[id]/reminders">) => {
    const user = await requireApiUser()
    await writeLimit(user.id)
    const { id } = await context.params
    return json(
      await actOnHabitReminder(
        user.id,
        parseId(id),
        await parseBody(request, habitReminderActionSchema)
      )
    )
  }
)
