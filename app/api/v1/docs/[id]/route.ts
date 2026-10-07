import { json, parseId, route } from "@/lib/server/api"
import { getDoc } from "@/lib/server/dal/quick-notes"
import { requireApiUser } from "@/lib/server/dal/session"
export const GET = route(
  async (_request, ctx: RouteContext<"/api/v1/docs/[id]">) => {
    const user = await requireApiUser()
    return json(await getDoc(user.id, parseId((await ctx.params).id)))
  }
)
