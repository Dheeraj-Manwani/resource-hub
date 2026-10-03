import { json, route } from "@/lib/server/api"
import { getProjectTree } from "@/lib/server/dal/projects"
import { requireApiUser } from "@/lib/server/dal/session"

/** Every project for the user, flat, with direct counts. The client builds
 * the tree and rolls counts up (`lib/projects/tree`) — a personal library's
 * project tree is small enough to load whole. */
export const GET = route(async () => {
  const user = await requireApiUser()
  const items = await getProjectTree(user.id)
  return json({ items })
})
