import { badRequest, json, notFound, parseId, route } from "@/lib/server/api"
import { getUserFile } from "@/lib/server/dal/files"
import { requireApiUser } from "@/lib/server/dal/session"
import { parseFilePreview } from "@/lib/server/file-preview"
import { getObjectBytes } from "@/lib/server/r2"
import { MAX_PREVIEW_BYTES } from "@/lib/resources/preview"

export const GET = route(
  async (_request, ctx: RouteContext<"/api/files/[fileId]/preview">) => {
    const user = await requireApiUser()
    const file = await getUserFile(user.id, parseId((await ctx.params).fileId))
    if (!file || file.status !== "ready") throw notFound("File")
    if (file.size > MAX_PREVIEW_BYTES)
      throw badRequest(
        "Inline previews support files up to 10 MB. Download this file to view it."
      )
    const bytes = await getObjectBytes(file.r2Key)
    try {
      return json(await parseFilePreview(bytes, file.mime, file.name), {
        headers: { "Cache-Control": "private, no-store" },
      })
    } catch (error) {
      throw badRequest(
        error instanceof Error &&
          /^(Inline|Preview|This file)/.test(error.message)
          ? error.message
          : "Couldn't read this file. It may be damaged or password-protected. Download it to view the original."
      )
    }
  }
)
