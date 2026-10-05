import { z } from "zod"
import { json, parseQuery, route } from "@/lib/server/api"
import { requireApiUser } from "@/lib/server/dal/session"
import { getMetadataStatuses } from "@/lib/server/dal/resources"
import { scheduleDueJobs } from "@/lib/server/metadata-runner"

const schema = z.object({
  ids: z
    .string()
    .max(2000)
    .transform((value) => value.split(","))
    .pipe(z.array(z.uuid()).min(1).max(50)),
})
export const GET = route(async (request) => {
  const user = await requireApiUser()
  const { ids } = parseQuery(request, schema)
  const items = await getMetadataStatuses(user.id, ids)
  if (items.some((row) => row.metadataStatus === "pending"))
    scheduleDueJobs(user.id)
  return json({ items })
})
