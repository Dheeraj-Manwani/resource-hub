import "server-only"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { r2Env, serverEnv, type R2Env } from "@/lib/env"
import { ApiError } from "@/lib/server/api"

const PRESIGN_SECONDS = 5 * 60

let cached: { client: S3Client; env: R2Env } | undefined

function getR2() {
  if (cached) return cached
  const env = r2Env()
  if (!env) {
    throw new ApiError(
      503,
      "File storage is not configured (set the R2_* environment variables).",
      "storage_not_configured"
    )
  }
  cached = {
    env,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    }),
  }
  return cached
}

export function isStorageConfigured() {
  return r2Env() !== null
}

/** Everything this app stores sits under `resource/` in the bucket. */
export const KEY_PREFIX = "resource/"

/** Every object lives under the owner's prefix: `resource/u/<userId>/<fileId>/<name>`. */
export function objectKey(userId: string, fileId: string, suffix: string) {
  const safe = suffix.replace(/[^\w.-]+/g, "_").slice(-80) || "file"
  return `${KEY_PREFIX}u/${userId}/${fileId}/${safe}`
}

/** Presigned PUT with Content-Type and Content-Length signed (R2 enforces them). */
export async function presignPut(
  key: string,
  contentType: string,
  contentLength: number
) {
  const { client, env } = getR2()
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    {
      expiresIn: PRESIGN_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    }
  )
}

export async function presignGet(
  key: string,
  {
    filename,
    contentType,
    download,
  }: { filename: string; contentType: string; download?: boolean }
) {
  const { client, env } = getR2()
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: key,
      ResponseContentDisposition: disposition,
      ResponseContentType: contentType,
      ResponseCacheControl: "private, max-age=300",
    }),
    { expiresIn: PRESIGN_SECONDS }
  )
}

export async function headObject(key: string) {
  const { client, env } = getR2()
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: env.bucket, Key: key })
    )
    return {
      size: head.ContentLength ?? 0,
      contentType: head.ContentType ?? "",
    }
  } catch {
    return null
  }
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const { client, env } = getR2()
  const res = await client.send(
    new GetObjectCommand({ Bucket: env.bucket, Key: key })
  )
  const bytes = await res.Body!.transformToByteArray()
  return Buffer.from(bytes)
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
) {
  const { client, env } = getR2()
  await client.send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

export async function deleteObject(key: string) {
  const { client, env } = getR2()
  await client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: key }))
}

/** Lists every object under `KEY_PREFIX`, paging through the whole bucket.
 * Used only by the cron orphan sweep. */
export async function listAllObjects(): Promise<
  { key: string; lastModified: Date | undefined }[]
> {
  const { client, env } = getR2()
  const out: { key: string; lastModified: Date | undefined }[] = []
  let continuationToken: string | undefined
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: env.bucket,
        Prefix: KEY_PREFIX,
        ContinuationToken: continuationToken,
      })
    )
    for (const obj of page.Contents ?? []) {
      if (obj.Key) out.push({ key: obj.Key, lastModified: obj.LastModified })
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return out
}

export function uploadLimits() {
  const env = serverEnv()
  return {
    imageBytes: env.UPLOAD_MAX_IMAGE_MB * 1024 * 1024,
    fileBytes: env.UPLOAD_MAX_FILE_MB * 1024 * 1024,
  }
}
