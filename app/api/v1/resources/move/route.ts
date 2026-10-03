import { badRequest, json, parseBody, route } from "@/lib/server/api"
import { moveResources } from "@/lib/server/dal/project-links"
import { filterOwnedResourceIds, getResourcesByIds } from "@/lib/server/dal/resources"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { moveResourcesSchema } from "@/lib/validation/projects"

/** Moves resources from one project (or unfiled) to another — used by the
 * Inbox triage flow and drag-and-drop onto a sidebar project. */
export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const { resourceIds, from, to } = await parseBody(
    request,
    moveResourcesSchema
  )
  const owned = await filterOwnedResourceIds(user.id, resourceIds)
  if (owned.length !== resourceIds.length)
    throw badRequest("Some of those resources weren't found")
  if (!(await moveResources(user.id, owned, from, to)))
    throw badRequest("Couldn't move those resources")
  const items = await getResourcesByIds(user.id, owned)
  return json({ items })
})
