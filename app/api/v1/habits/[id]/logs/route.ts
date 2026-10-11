import { route, json, parseBody, parseId } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { addHabitLog } from "@/lib/server/dal/habits"
import { logHabitSchema } from "@/lib/habits/model"
export const POST = route(
  async (request, context: RouteContext<"/api/v1/habits/[id]/logs">) => {
    const user = await requireApiUser()
    await writeLimit(user.id)
    const { id } = await context.params
    return json(
      await addHabitLog(
        user.id,
        parseId(id),
        await parseBody(request, logHabitSchema)
      ),
      { status: 201 }
    )
  }
)
