import { route, json, parseBody } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { startTimerSchema } from "@/lib/habits/timer"
import { getHabitTimer, startHabitTimer } from "@/lib/server/dal/habit-timer"
export const GET = route(async () =>
  json(await getHabitTimer((await requireApiUser()).id))
)
export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  return json(
    await startHabitTimer(user.id, await parseBody(request, startTimerSchema)),
    { status: 201 }
  )
})
