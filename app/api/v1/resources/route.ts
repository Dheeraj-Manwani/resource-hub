import { badRequest, json, parseBody, parseQuery, route } from "@/lib/server/api"
import { getDescendantIds } from "@/lib/server/dal/projects"
import { listResources } from "@/lib/server/dal/resources"
import { requireApiUser } from "@/lib/server/dal/session"
import { scheduleDueJobs } from "@/lib/server/metadata-runner"
import { writeLimit } from "@/lib/server/rate-limit"
import { createFromInput } from "@/lib/server/resource-service"
import {
  createResourceSchema,
  listResourcesQuerySchema,
} from "@/lib/validation/resources"

export const GET = route(async (request) => {
  const user = await requireApiUser()
  const query = parseQuery(request, listResourcesQuerySchema)
  let projectIds: string[] | undefined
  if (query.projectId) {
    if (query.includeDescendants) {
      const ids = await getDescendantIds(user.id, query.projectId)
      if (!ids) throw badRequest("Project not found")
      projectIds = ids
    } else {
      projectIds = [query.projectId]
    }
  }
  const page = await listResources(user.id, query, { projectIds })
  if (page.items.some((r) => r.metadataStatus === "pending"))
    scheduleDueJobs(user.id)
  return json(page)
})

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, createResourceSchema)
  const resource = await createFromInput(user.id, input)
  return json(resource, { status: 201 })
})
