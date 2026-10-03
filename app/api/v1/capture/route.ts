import { normalizeUrl } from "@/lib/resources/detect"
import { json, parseBody, route } from "@/lib/server/api"
import { findDuplicate, getResource } from "@/lib/server/dal/resources"
import { requireApiUserOrToken } from "@/lib/server/dal/session"
import { rateLimit } from "@/lib/server/rate-limit"
import { createFromInput } from "@/lib/server/resource-service"
import { captureSchema } from "@/lib/validation/resources"

/**
 * Capture endpoint for the share target, bookmarklet and iOS Shortcut.
 * Accepts the session cookie or `Authorization: Bearer <personal token>`.
 * Saved items land in the Inbox; an existing URL is returned, not duplicated.
 */
export const POST = route(async (request) => {
  const user = await requireApiUserOrToken(request)
  await rateLimit(`capture:${user.id}`, { limit: 60, windowSeconds: 60 })
  const input = await parseBody(request, captureSchema)

  const candidate = input.url || undefined
  const normalized = candidate ? normalizeUrl(candidate) : null
  if (normalized) {
    const existing = await findDuplicate(user.id, normalized)
    if (existing) {
      return json({
        resource: await getResource(user.id, existing.id),
        duplicate: true,
      })
    }
  }

  const resource = await createFromInput(user.id, {
    url: normalized ? candidate : undefined,
    text: normalized
      ? undefined
      : [input.text, input.url].filter(Boolean).join("\n"),
    title: input.title,
  })
  return json({ resource, duplicate: false }, { status: 201 })
})
