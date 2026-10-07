import { z } from "zod"

import {
  json,
  notFound,
  parseBody,
  parseId,
  parseQuery,
  route,
} from "@/lib/server/api"
import {
  getResourceChecklist,
  updateResourceChecklist,
} from "@/lib/server/dal/resource-checklists"
import { requireApiUser } from "@/lib/server/dal/session"
import { writeLimit } from "@/lib/server/rate-limit"
import { resourceChecklistActionSchema } from "@/lib/projects/resource-checklist"

type Ctx = RouteContext<"/api/v1/projects/[id]/checklist">
const querySchema = z.object({
  includeDescendants: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
})

export const GET = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  const id = parseId((await ctx.params).id)
  const { includeDescendants } = parseQuery(request, querySchema)
  const data = await getResourceChecklist(user.id, id, includeDescendants)
  if (!data) throw notFound("Project")
  return json(data)
})

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser()
  await writeLimit(user.id)
  const id = parseId((await ctx.params).id)
  const action = await parseBody(request, resourceChecklistActionSchema)
  if (!(await updateResourceChecklist(user.id, id, action)))
    throw notFound("Project or resource")
  return json({ saved: true })
})
