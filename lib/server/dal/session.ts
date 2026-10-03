import "server-only"

import { createHash } from "node:crypto"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { getAuth } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiTokens, user } from "@/lib/db/schema"
import { unauthorized } from "@/lib/server/api"

export type AppUser = {
  id: string
  name: string
  email: string
  image: string | null
}

/** Reads the Better Auth session once per request. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  // Await the request API first: it marks the route dynamic before any env or
  // DB access happens (so `next build` never needs secrets).
  const requestHeaders = await headers()
  const session = await getAuth().api.getSession({ headers: requestHeaders })
  if (!session) return null
  // Defense in depth: an email removed from the allowlist loses access.
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  }
})

/** For pages and layouts: redirects signed-out visitors to the landing page. */
export async function requireUser(): Promise<AppUser> {
  const current = await getCurrentUser()
  if (!current) redirect("/")
  return current
}

/** For route handlers: throws a 401 ApiError when signed out. */
export async function requireApiUser(): Promise<AppUser> {
  const current = await getCurrentUser()
  if (!current) throw unauthorized()
  return current
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

/** Session cookie, or `Authorization: Bearer <personal token>` (capture). */
export async function requireApiUserOrToken(
  request: Request
): Promise<AppUser> {
  const auth = request.headers.get("authorization")
  const match = auth ? /^Bearer\s+(\S+)$/i.exec(auth) : null
  if (!match) return requireApiUser()

  const [row] = await db
    .select({
      tokenId: apiTokens.id,
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(apiTokens)
    .innerJoin(user, eq(user.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(match[1]!)))
    .limit(1)
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.tokenId))
  return { id: row.id, name: row.name, email: row.email, image: row.image }
}
