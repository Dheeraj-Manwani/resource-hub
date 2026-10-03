import { json, parseBody, route } from "@/lib/server/api"
import {
  bulkAddTags,
  bulkRemoveTagsByName,
  bulkSetPriority,
  bulkSetProject,
  bulkSetStatus,
  softDeleteTasks,
} from "@/lib/server/dal/tasks"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { bulkTaskActionSchema } from "@/lib/validation/tasks"

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, bulkTaskActionSchema)

  switch (input.action) {
    case "status":
      await bulkSetStatus(user.id, input.taskIds, input.status)
      break
    case "priority":
      await bulkSetPriority(user.id, input.taskIds, input.priority)
      break
    case "project":
      await bulkSetProject(user.id, input.taskIds, input.projectId)
      break
    case "tag":
      await bulkAddTags(user.id, input.taskIds, input.tags)
      break
    case "untag":
      await bulkRemoveTagsByName(user.id, input.taskIds, input.tags)
      break
    case "delete":
      await softDeleteTasks(user.id, input.taskIds)
      break
  }
  return json({ updated: input.taskIds.length })
})
