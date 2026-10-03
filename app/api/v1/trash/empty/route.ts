import { json, route } from "@/lib/server/api"
import { emptyTrash } from "@/lib/server/dal/trash"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"

export const POST = route(async () => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const count = await emptyTrash(user.id)
  return json({ deleted: count })
})
