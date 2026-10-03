import { json, parseBody, parseId, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { completeUpload } from "@/lib/server/upload-service"
import { completeUploadSchema } from "@/lib/validation/resources"

export const POST = route(
  async (request, ctx: RouteContext<"/api/v1/uploads/[id]/complete">) => {
    const user = await requireApiUser()
    await writeLimit(user.id)
    const id = parseId((await ctx.params).id)
    const input = await parseBody(request, completeUploadSchema)
    return json(await completeUpload(user.id, id, input), { status: 201 })
  }
)
