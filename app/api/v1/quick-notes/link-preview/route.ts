import { badRequest, json, parseQuery, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { assertMetadataFetchQuota } from "@/lib/server/quotas"
import { safeHttpUrl } from "@/lib/server/sanitize"
import { linkPreviewSchema } from "@/lib/validation/quick-notes"
import { fetchHtmlMetadata } from "@/lib/resources/metadata/html"

/** Best-effort title lookup for a pasted URL, so the "smart" link paste in
 * a note's editor can swap the raw URL for a readable title. Failures are
 * swallowed into `{ title: null }` — a broken preview shouldn't block the
 * paste that's already landed in the document. */
export const GET = route(async (request) => {
  const user = await requireApiUser()
  const { url } = parseQuery(request, linkPreviewSchema)
  const safe = safeHttpUrl(url)
  if (!safe) throw badRequest("Not a valid http(s) URL")

  await assertMetadataFetchQuota(user.id)
  try {
    const { metadata } = await fetchHtmlMetadata(safe)
    return json({
      title: metadata.title ?? null,
      siteName: metadata.siteName ?? null,
    })
  } catch {
    return json({ title: null, siteName: null })
  }
})
