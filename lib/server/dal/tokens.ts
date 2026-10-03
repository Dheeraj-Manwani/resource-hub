import "server-only"

import { randomBytes } from "node:crypto"

import { and, desc, eq } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import { apiTokens } from "@/lib/db/schema"

import { hashToken } from "./session"

export type ApiTokenDto = {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  createdAt: string
}

export async function listTokens(userId: string): Promise<ApiTokenDto[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Creates a personal token; the plain value is only returned once. */
export async function createToken(userId: string, name: string) {
  const token = `rh_${randomBytes(24).toString("base64url")}`
  const id = uuidv7()
  await db.insert(apiTokens).values({
    id,
    userId,
    name,
    tokenHash: hashToken(token),
    prefix: token.slice(0, 7),
  })
  return { id, token }
}

export async function revokeToken(userId: string, id: string) {
  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id })
  return deleted.length > 0
}
