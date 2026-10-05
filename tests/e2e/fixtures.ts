import { randomUUID } from "node:crypto"
import { test as base, expect } from "@playwright/test"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3"
import * as schema from "../../lib/db/schema"

type TestAccount = { id: string; email: string }

export const test = base.extend<{ testAccount: TestAccount }>({
  testAccount: async ({ context, baseURL }, runTest) => {
    if (!baseURL || new URL(baseURL).hostname !== "localhost")
      throw new Error("Authenticated E2E tests only run against localhost.")
    const databaseURL = process.env.DATABASE_URL
    const secret = process.env.BETTER_AUTH_SECRET
    if (!databaseURL || !secret)
      throw new Error(
        "E2E requires DATABASE_URL and BETTER_AUTH_SECRET in .env.local or .env."
      )
    const client = postgres(databaseURL, { max: 2 })
    const db = drizzle(client, { schema, casing: "snake_case" })
    // Only the test process enables passwords. No app auth bypass or public
    // test endpoint is added; app sessions and CRUD use the real database.
    const auth = betterAuth({
      baseURL,
      secret,
      database: drizzleAdapter(db, { provider: "pg", schema }),
      emailAndPassword: { enabled: true },
    })
    const email = `playwright-${randomUUID()}@example.invalid`
    const password = `E2e-${randomUUID()}`
    let id: string | undefined
    try {
      const created = await auth.api.signUpEmail({
        body: { name: "Playwright Test", email, password },
      })
      id = created.user.id
      await db
        .insert(schema.userSettings)
        .values({ userId: id, hasSeenOnboarding: true })
      const login = await auth.api.signInEmail({
        body: { email, password },
        returnHeaders: true,
      })
      expect(login.response.user.id).toBe(id)
      const cookies = login.headers.getSetCookie().map((header) => {
        const pair = header.split(";", 1)[0]!
        const separator = pair.indexOf("=")
        return {
          name: pair.slice(0, separator),
          value: decodeURIComponent(pair.slice(separator + 1)),
          url: baseURL,
          httpOnly: true,
          sameSite: "Lax" as const,
        }
      })
      expect(
        cookies.some((cookie) => cookie.name === "better-auth.session_token")
      ).toBe(true)
      await context.addCookies(cookies)
      const sessionResponse = await context.request.get(
        `${baseURL}/api/auth/get-session`
      )
      expect(sessionResponse.ok()).toBe(true)
      const authenticated = await sessionResponse.json()
      expect(
        authenticated?.user?.id,
        "The local server must authenticate the generated test account"
      ).toBe(id)
      expect(authenticated?.user?.email).toBe(email)
      console.log(`Disposable test account: ${email}`)
      await runTest({ id, email })
    } finally {
      try {
        if (id) {
          const files = await db
            .select({ key: schema.files.r2Key })
            .from(schema.files)
            .where(eq(schema.files.userId, id))
          if (files.length) {
            const storage = new S3Client({
              region: "auto",
              endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
              credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
              },
            })
            try {
              for (const file of files) {
                if (!file.key.startsWith(`resource/u/${id}/`))
                  throw new Error(
                    "Refusing cleanup of a file outside the test account."
                  )
                await storage.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.R2_BUCKET!,
                    Key: file.key,
                  })
                )
              }
            } finally {
              storage.destroy()
            }
          }
          // Both predicates are exact, so cleanup cannot delete another user.
          await db
            .delete(schema.user)
            .where(and(eq(schema.user.id, id), eq(schema.user.email, email)))
          expect(
            await db
              .select({ id: schema.user.id })
              .from(schema.user)
              .where(eq(schema.user.id, id))
          ).toHaveLength(0)
        }
      } finally {
        await client.end()
      }
    }
  },
})
export { expect }
