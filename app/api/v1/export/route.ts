import { route } from "@/lib/server/api"
import { buildExport } from "@/lib/server/dal/export"
import { requireApiUser } from "@/lib/server/dal/session"
import { rateLimit } from "@/lib/server/rate-limit"

export const GET = route(async () => {
  const user = await requireApiUser()
  await rateLimit(`export:${user.id}`, { limit: 5, windowSeconds: 300 })
  const data = await buildExport(user.id)
  const filename = `resource-hub-export-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
})
