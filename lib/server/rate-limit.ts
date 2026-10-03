import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { rateLimits } from "@/lib/db/schema"
import { ApiError } from "@/lib/server/api"

/**
 * Fixed-window rate limit stored in Postgres (works across serverless
 * instances). Throws a 429 ApiError when the limit is exceeded.
 */
export async function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number }
) {
  const now = Date.now()
  const windowStart = new Date(now - (now % (windowSeconds * 1000)))
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })
  if (row && row.count > limit) {
    throw new ApiError(
      429,
      "Too many requests, slow down a little",
      "rate_limited"
    )
  }
}

/** Default budget for write endpoints. */
export const writeLimit = (userId: string, scope = "write") =>
  rateLimit(`${scope}:${userId}`, { limit: 120, windowSeconds: 60 })
