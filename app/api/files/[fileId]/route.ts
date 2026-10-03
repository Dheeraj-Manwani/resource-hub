import { notFound, parseId, route } from "@/lib/server/api"
import { getUserFile } from "@/lib/server/dal/files"
import { requireApiUser } from "@/lib/server/dal/session"
import { presignGet } from "@/lib/server/r2"

/** Ownership check, then a 302 to a 5-minute presigned GET. */
export const GET = route(
  async (request, ctx: RouteContext<"/api/files/[fileId]">) => {
    const user = await requireApiUser()
    const id = parseId((await ctx.params).fileId)
    const file = await getUserFile(user.id, id)
    if (!file || file.status !== "ready") throw notFound("File")
    const url = await presignGet(file.r2Key, {
      filename: file.name,
      contentType: file.mime,
      download: request.nextUrl.searchParams.get("download") === "1",
    })
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, max-age=240" },
    })
  }
)
