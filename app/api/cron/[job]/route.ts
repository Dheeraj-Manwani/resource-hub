import { json, notFound, route, unauthorized } from "@/lib/server/api"
import { purgeStalePendingUploads, sweepOrphanObjects } from "@/lib/server/dal/files"
import { purgeOldTrash } from "@/lib/server/dal/trash"
import { serverEnv } from "@/lib/env"
import { runDueJobs } from "@/lib/server/metadata-runner"
import { isStorageConfigured } from "@/lib/server/r2"

type Ctx = RouteContext<"/api/cron/[job]">

function checkSecret(request: Request) {
  const secret = serverEnv().CRON_SECRET
  if (!secret) return // not configured: local dev only, never deploy without it
  const header = request.headers.get("authorization")
  if (header !== `Bearer ${secret}`) throw unauthorized()
}

/**
 * Scheduled maintenance (Vercel Cron → `vercel.json`, `Authorization: Bearer
 * $CRON_SECRET`). One job for now, `sweep`, which does everything 6.3 asks
 * for in a single pass: retries any due metadata jobs across all users,
 * purges Trash older than 30 days (R2 objects included), drops upload rows
 * that never completed, and (when R2 is configured) removes R2 objects with
 * no matching `files` row.
 */
export const GET = route(async (request, ctx: Ctx) => {
  checkSecret(request)
  const { job } = await ctx.params
  if (job !== "sweep") throw notFound("Cron job")

  const [retriedJobs, trashedCount, staleUploads] = await Promise.all([
    runDueJobs({ limit: 50 }),
    purgeOldTrash(30),
    purgeStalePendingUploads(24),
  ])
  const orphanObjects = isStorageConfigured() ? await sweepOrphanObjects(24) : 0

  return json({ job, retriedJobs, trashedCount, staleUploads, orphanObjects })
})
