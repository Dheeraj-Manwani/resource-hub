import "server-only"

import { and, eq, gte, inArray, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { files, resources } from "@/lib/db/schema"
import { serverEnv } from "@/lib/env"
import { ApiError } from "@/lib/server/api"
import { rateLimit } from "@/lib/server/rate-limit"

/** Sign-up is open to any Google account, so storage, resource creation and
 * metadata-fetch volume each get a per-user ceiling instead of a gatekeeping
 * allowlist. */
const DAILY_RESOURCE_LIMIT = 500
const METADATA_FETCHES_PER_HOUR = 300

export function storageQuotaBytes(): number {
  return serverEnv().USER_STORAGE_QUOTA_MB * 1024 * 1024
}

/** Bytes used by this user's files: ready objects plus pending uploads that
 * haven't been swept yet (they still hold a slot until they land or expire). */
export async function storageUsageBytes(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${files.size}), 0)` })
    .from(files)
    .where(and(eq(files.userId, userId), inArray(files.status, ["ready", "pending"])))
  return Number(row?.total ?? 0)
}

export async function usageSummary(userId: string) {
  const [used, quota] = [await storageUsageBytes(userId), storageQuotaBytes()]
  return { storageUsedBytes: used, storageQuotaBytes: quota }
}

export async function assertStorageQuota(userId: string, incomingBytes: number) {
  const used = await storageUsageBytes(userId)
  const quota = storageQuotaBytes()
  if (used + incomingBytes > quota) {
    throw new ApiError(
      413,
      `Storage quota exceeded (${Math.round(quota / 1024 / 1024)} MB used). Delete something or empty Trash to free up space.`,
      "quota_exceeded"
    )
  }
}

export async function resourcesCreatedToday(userId: string): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resources)
    .where(and(eq(resources.userId, userId), gte(resources.createdAt, startOfDay)))
  return row?.count ?? 0
}

export async function assertResourceCreationQuota(userId: string, adding: number) {
  const count = await resourcesCreatedToday(userId)
  if (count + adding > DAILY_RESOURCE_LIMIT) {
    throw new ApiError(
      429,
      `Daily limit of ${DAILY_RESOURCE_LIMIT} new resources reached. Try again tomorrow.`,
      "quota_exceeded"
    )
  }
}

/** Throws (429, retryable by the metadata job's own backoff) once this user
 * has fetched metadata too many times in the last hour. */
export async function assertMetadataFetchQuota(userId: string) {
  await rateLimit(`metadata-quota:${userId}`, {
    limit: METADATA_FETCHES_PER_HOUR,
    windowSeconds: 3600,
  })
}
