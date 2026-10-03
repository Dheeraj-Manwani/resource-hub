import "server-only"

import { and, eq, isNull, lte, or, sql } from "drizzle-orm"
import { after } from "next/server"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import { jobs, resources } from "@/lib/db/schema"
import { fetchMetadata, MetadataError } from "@/lib/resources/metadata"
import type { ResourceMetadata } from "@/lib/resources/types"
import {
  discardOldThumbnails,
  storeGeneratedFile,
} from "@/lib/server/dal/files"
import { makeThumbnail } from "@/lib/server/images"
import { isStorageConfigured } from "@/lib/server/r2"
import { safeFetch } from "@/lib/server/ssrf"

const JOB_KIND = "metadata"
const MAX_RETRIES = 3
const BASE_DELAY_MS = 30_000
const FETCHABLE = new Set([
  "youtube",
  "instagram",
  "x",
  "github",
  "pinterest",
  "link",
])

/** Copies the snapshot's remote image into R2 so cards survive link rot. */
async function snapshotImage(
  userId: string,
  resourceId: string,
  imageUrl: string
) {
  const res = await safeFetch(imageUrl, {
    accept: ["image/"],
    maxBytes: 8 * 1024 * 1024,
  })
  if (res.status !== 200 || res.body.byteLength === 0) return null
  const thumb = await makeThumbnail(res.body)
  const fileId = await storeGeneratedFile(userId, {
    resourceId,
    name: "snapshot.webp",
    mime: "image/webp",
    data: thumb.data,
    width: thumb.width,
    height: thumb.height,
    role: "preview",
  })
  return { fileId, width: thumb.sourceWidth, height: thumb.sourceHeight }
}

async function scheduleRetry(
  userId: string,
  resourceId: string,
  attempt: number,
  error: string
) {
  const runAfter = new Date(Date.now() + BASE_DELAY_MS * 4 ** (attempt - 1))
  await db
    .delete(jobs)
    .where(
      and(
        eq(jobs.kind, JOB_KIND),
        sql`${jobs.payload}->>'resourceId' = ${resourceId}`
      )
    )
  await db.insert(jobs).values({
    id: uuidv7(),
    userId,
    kind: JOB_KIND,
    payload: { resourceId },
    attempts: attempt,
    runAfter,
    lastError: error.slice(0, 1_000),
  })
}

/**
 * Fetches and stores a metadata snapshot. `attempt` 0 is the inline run;
 * retryable failures are queued with exponential backoff (30s, 2m, 8m) and
 * after MAX_RETRIES the resource is marked failed (plain link card).
 * Returns true when the resource reached a final state.
 */
export async function processResourceMetadata(
  resourceId: string,
  attempt = 0
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(resources)
    .where(and(eq(resources.id, resourceId), isNull(resources.deletedAt)))
    .limit(1)
  if (!row || !row.url || !FETCHABLE.has(row.type)) {
    if (row && row.metadataStatus === "pending") {
      await db
        .update(resources)
        .set({ metadataStatus: "ok" })
        .where(eq(resources.id, resourceId))
    }
    return true
  }

  try {
    const result = await fetchMetadata({
      type: row.type,
      url: row.url,
      metadata: row.metadata,
    })
    const metadata: ResourceMetadata = { ...result.metadata, error: undefined }
    let thumbnailFileId = row.thumbnailFileId

    const image = row.metadataOverride?.image ?? metadata.image
    if (
      image &&
      isStorageConfigured() &&
      !metadata.thumbnailIsCustom &&
      (metadata.imageSnapshotOf !== image || !thumbnailFileId)
    ) {
      try {
        const snap = await snapshotImage(row.userId, row.id, image)
        if (snap) {
          await discardOldThumbnails(row.id, snap.fileId)
          thumbnailFileId = snap.fileId
          metadata.imageSnapshotOf = image
          metadata.imageWidth ??= snap.width ?? undefined
          metadata.imageHeight ??= snap.height ?? undefined
        }
      } catch (error) {
        // A broken image shouldn't fail the whole snapshot.
        console.warn(
          "[metadata] image snapshot failed",
          resourceId,
          (error as Error).message
        )
      }
    }

    await db
      .update(resources)
      .set({
        metadata,
        metadataStatus: "ok",
        metadataFetchedAt: new Date(),
        thumbnailFileId,
        url: result.url ?? row.url,
        embedStatus: result.embedStatus ?? row.embedStatus,
        title: row.title ?? metadata.title ?? null,
      })
      .where(eq(resources.id, resourceId))
    return true
  } catch (error) {
    const message = (error as Error).message ?? "Unknown error"
    const retryable = !(error instanceof MetadataError) || error.retryable
    if (retryable && attempt < MAX_RETRIES) {
      await scheduleRetry(row.userId, row.id, attempt + 1, message)
      return false
    }
    await db
      .update(resources)
      .set({
        metadataStatus: "failed",
        metadataFetchedAt: new Date(),
        metadata: { ...row.metadata, error: message.slice(0, 300) },
        ...(error instanceof MetadataError && error.embedStatus
          ? { embedStatus: error.embedStatus }
          : {}),
      })
      .where(eq(resources.id, resourceId))
    return true
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<unknown>
) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift()!
        await fn(item).catch((error) => console.error("[metadata]", error))
      }
    })
  )
}

/** Runs metadata fetching after the response is sent (bulk add stays instant). */
export function scheduleMetadata(resourceIds: string[]) {
  if (!resourceIds.length) return
  after(() => runPool(resourceIds, 4, (id) => processResourceMetadata(id)))
}

/**
 * Claims and runs due retry jobs. Called opportunistically after list
 * requests (the client polls while anything is pending), and later by cron.
 */
export async function runDueJobs({
  userId,
  limit = 5,
}: { userId?: string; limit?: number } = {}) {
  const now = new Date()
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: jobs.id, payload: jobs.payload, attempts: jobs.attempts })
      .from(jobs)
      .where(
        and(
          eq(jobs.kind, JOB_KIND),
          lte(jobs.runAfter, now),
          or(isNull(jobs.lockedUntil), lte(jobs.lockedUntil, now)),
          userId ? eq(jobs.userId, userId) : undefined
        )
      )
      .limit(limit)
      .for("update", { skipLocked: true })
    for (const job of due) {
      await tx
        .update(jobs)
        .set({ lockedUntil: new Date(now.getTime() + 60_000) })
        .where(eq(jobs.id, job.id))
    }
    return due
  })

  await runPool(claimed, 3, async (job) => {
    const resourceId = String(job.payload.resourceId ?? "")
    // Remove the claimed job first; a new retry row is inserted on failure.
    await db.delete(jobs).where(eq(jobs.id, job.id))
    if (resourceId) await processResourceMetadata(resourceId, job.attempts)
  })
  return claimed.length
}

export function scheduleDueJobs(userId: string) {
  after(() =>
    runDueJobs({ userId }).catch((error) => console.error("[jobs]", error))
  )
}
