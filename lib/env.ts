import "server-only"

import { z } from "zod"

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined))

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "is required (Postgres connection string)"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters (openssl rand -base64 32)"),
  BETTER_AUTH_URL: z.url("must be the app's base URL"),
  GOOGLE_CLIENT_ID: z.string().min(1, "is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "is required"),
  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET: optional,
  /** Base URL of the bucket's public access (r2.dev subdomain or a custom
   * domain) when it's been made public. When unset, files are served through
   * signed, expiring redirects instead (see `lib/server/r2.ts`). */
  R2_PUBLIC_URL: optional,
  UPLOAD_MAX_IMAGE_MB: z.coerce.number().positive().default(20),
  UPLOAD_MAX_FILE_MB: z.coerce.number().positive().default(50),
  USER_STORAGE_QUOTA_MB: z.coerce.number().positive().default(1024),
  CRON_SECRET: optional,
  GITHUB_TOKEN: optional,
  YOUTUBE_API_KEY: optional,
  META_OEMBED_TOKEN: optional,
  SEED_USER_EMAIL: optional,
})

export type ServerEnv = z.infer<typeof serverSchema>

let cached: ServerEnv | undefined

/**
 * Validated server environment. Parsed lazily (so `next build` works without
 * secrets) and validated at boot from `instrumentation.ts`, so a missing var
 * fails fast with a readable message.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached
  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".")}: ${i.message}`
    )
    throw new Error(
      `Invalid environment variables:\n${lines.join("\n")}\nSee .env.example.`
    )
  }
  cached = parsed.data
  return cached
}

export type R2Env = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export function r2Env(): R2Env | null {
  const env = serverEnv()
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET
  ) {
    return null
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  }
}
