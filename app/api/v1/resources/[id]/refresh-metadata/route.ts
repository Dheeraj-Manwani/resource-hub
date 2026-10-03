import { json, notFound, parseId, route } from "@/lib/server/api"
import { getResource, markMetadataPending } from "@/lib/server/dal/resources"
import { requireApiUser } from "@/lib/server/dal/session"
import { scheduleMetadata } from "@/lib/server/metadata-runner"
import { rateLimit } from "@/lib/server/rate-limit"

export const POST = route(
  async (
    _request,
    ctx: RouteContext<"/api/v1/resources/[id]/refresh-metadata">
  ) => {
    const user = await requireApiUser()
    await rateLimit(`refresh:${user.id}`, { limit: 30, windowSeconds: 60 })
    const id = parseId((await ctx.params).id)
    if (!(await markMetadataPending(user.id, id))) throw notFound()
    scheduleMetadata([id])
    return json(await getResource(user.id, id), { status: 202 })
  }
)
