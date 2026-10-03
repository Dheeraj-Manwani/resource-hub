import { json, parseBody, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { runBulkAction } from "@/lib/server/project-service"
import { writeLimit } from "@/lib/server/rate-limit"
import { bulkActionSchema } from "@/lib/validation/projects"

export const POST = route(async (request) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const input = await parseBody(request, bulkActionSchema)
  const items = await runBulkAction(user.id, input)
  return json({ items })
})
