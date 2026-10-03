import { notFound, parseId, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { revokeToken } from "@/lib/server/dal/tokens"

export const DELETE = route(
  async (_request, ctx: RouteContext<"/api/v1/tokens/[id]">) => {
    const user = await requireApiUser()
    const id = parseId((await ctx.params).id)
    if (!(await revokeToken(user.id, id))) throw notFound("Token")
    return new Response(null, { status: 204 })
  }
)
