import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { serverEnv } from "@/lib/env"

function createAuth() {
  const env = serverEnv()
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    // Google is the only way in: no email/password, no other providers.
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await db
              .insert(schema.userSettings)
              .values({ userId: created.id })
              .onConflictDoNothing()
          },
        },
      },
    },
    onAPIError: { errorURL: "/" },
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]

const globalForAuth = globalThis as unknown as { __auth?: Auth }

export function getAuth(): Auth {
  globalForAuth.__auth ??= createAuth()
  return globalForAuth.__auth
}
