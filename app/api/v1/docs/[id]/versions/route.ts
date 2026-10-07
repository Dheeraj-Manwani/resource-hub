import { z } from "zod"
import { json, parseBody, parseId, route } from "@/lib/server/api"
import {
  listDocVersions,
  restoreDocVersion,
} from "@/lib/server/dal/quick-notes"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
type Ctx = RouteContext<"/api/v1/docs/[id]/versions">
export const GET = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser()
  return json({
    items: await listDocVersions(user.id, parseId((await ctx.params).id)),
  })
})
export const POST = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(
    request,
    z.object({
      revision: z.number().int().nonnegative(),
      expectedRevision: z.number().int().nonnegative(),
    })
  )
  return json(
    await restoreDocVersion(
      user.id,
      parseId((await ctx.params).id),
      input.revision,
      input.expectedRevision
    )
  )
})
