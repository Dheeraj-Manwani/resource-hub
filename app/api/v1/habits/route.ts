import { z } from "zod"
import { route, json, parseBody, parseQuery } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { createHabit, listHabits } from "@/lib/server/dal/habits"
import { createHabitSchema, dateSchema } from "@/lib/habits/model"
export const GET = route(async (request) => {
  const user = await requireApiUser()
  const query = parseQuery(request, z.object({ date: dateSchema.optional() }))
  return json(await listHabits(user.id, query.date))
})
export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  return json(
    await createHabit(user.id, await parseBody(request, createHabitSchema)),
    { status: 201 }
  )
})
