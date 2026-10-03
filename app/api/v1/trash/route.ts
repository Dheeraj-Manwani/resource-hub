import { json, route } from "@/lib/server/api"
import { listTrash } from "@/lib/server/dal/trash"
import { requireApiUser } from "@/lib/server/dal/session"

export const GET = route(async () => {
  const user = await requireApiUser()
  return json({ items: await listTrash(user.id) })
})
