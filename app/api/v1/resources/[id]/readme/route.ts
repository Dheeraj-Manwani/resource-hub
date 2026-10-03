import { fetchGithubReadme, MetadataError } from "@/lib/resources/metadata"
import { ApiError, json, notFound, parseId, route } from "@/lib/server/api"
import { getResourceRow } from "@/lib/server/dal/resources"
import { requireApiUser } from "@/lib/server/dal/session"
import { rateLimit } from "@/lib/server/rate-limit"

/** GitHub README, fetched lazily when a repo card is expanded. */
export const GET = route(
  async (_request, ctx: RouteContext<"/api/v1/resources/[id]/readme">) => {
    const user = await requireApiUser()
    await rateLimit(`readme:${user.id}`, { limit: 30, windowSeconds: 60 })
    const id = parseId((await ctx.params).id)
    const row = await getResourceRow(user.id, id)
    const gh = row?.metadata.github
    if (!row || row.type !== "github" || gh?.kind !== "repo" || !gh.repo)
      throw notFound("README")
    try {
      const html = await fetchGithubReadme(gh.owner, gh.repo)
      return json(
        { html },
        { headers: { "Cache-Control": "private, max-age=600" } }
      )
    } catch (error) {
      if (error instanceof MetadataError)
        throw new ApiError(502, error.message, "upstream_error")
      throw error
    }
  }
)
