import { badRequest, json, parseBody, route } from "@/lib/server/api"
import { createPendingFile } from "@/lib/server/dal/files"
import { requireApiUser } from "@/lib/server/dal/session"
import { assertStorageQuota } from "@/lib/server/quotas"
import { presignPut, uploadLimits } from "@/lib/server/r2"
import { writeLimit } from "@/lib/server/rate-limit"
import { createQuickNoteImageSchema } from "@/lib/validation/quick-notes"

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, createQuickNoteImageSchema)

  const limits = uploadLimits()
  if (input.size > limits.imageBytes) {
    throw badRequest(
      `Image is too large (max ${Math.round(limits.imageBytes / 1024 / 1024)} MB)`
    )
  }
  await assertStorageQuota(user.id, input.size)

  const file = await createPendingFile(user.id, {
    name: input.name,
    mime: input.mime,
    size: input.size,
    role: "original",
  })
  const uploadUrl = await presignPut(file.r2Key, input.mime, input.size)
  return json(
    { fileId: file.id, uploadUrl, headers: { "Content-Type": input.mime } },
    { status: 201 }
  )
})
