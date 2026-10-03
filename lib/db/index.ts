import "server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { serverEnv } from "@/lib/env"

import * as schema from "./schema"

function createDb() {
  const client = postgres(serverEnv().DATABASE_URL, { max: 10 })
  return drizzle(client, { schema, casing: "snake_case" })
}

export type Db = ReturnType<typeof createDb>

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __db?: Db }

export function getDb(): Db {
  globalForDb.__db ??= createDb()
  return globalForDb.__db
}

/** Lazily-initialized Drizzle instance (no connection until first use). */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb()
    const value = Reflect.get(real, prop, real)
    return typeof value === "function" ? value.bind(real) : value
  },
})

export { schema }
