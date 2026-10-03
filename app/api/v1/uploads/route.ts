import { json, parseBody, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { rateLimit } from "@/lib/server/rate-limit"
import { startUpload } from "@/lib/server/upload-service"
import { createUploadSchema } from "@/lib/validation/resources"

/** Returns a 5-minute presigned PUT; the browser uploads straight to R2. */
export const POST = route(async (request) => {
  const user = await requireApiUser()
  await rateLimit(`upload:${user.id}`, { limit: 60, windowSeconds: 60 })
  const input = await parseBody(request, createUploadSchema)
  return json(await startUpload(user.id, input), { status: 201 })
})
