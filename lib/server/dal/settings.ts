import "server-only"

import { eq } from "drizzle-orm"
import { randomBytes } from "node:crypto"

import { db } from "@/lib/db"
import { userSettings } from "@/lib/db/schema"

export type SettingsDto = {
  timezone: string
  weekStart: number
  libraryView: "grid" | "list" | "focus"
  calendarColorMode: "project" | "priority" | "status"
  /** Secret path segment for the subscribable `.ics` feed; null until first generated. */
  icsToken: string | null
}

export async function getSettings(userId: string): Promise<SettingsDto> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  if (row) {
    return {
      timezone: row.timezone,
      weekStart: row.weekStart,
      libraryView: row.libraryView,
      calendarColorMode: row.calendarColorMode,
      icsToken: row.icsToken,
    }
  }
  await db.insert(userSettings).values({ userId }).onConflictDoNothing()
  return {
    timezone: "UTC",
    weekStart: 1,
    libraryView: "grid",
    calendarColorMode: "project",
    icsToken: null,
  }
}

/** Generates (or replaces) the ICS feed token, revoking any previously
 * shared subscribe link. */
export async function regenerateIcsToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url")
  await db
    .insert(userSettings)
    .values({ userId, icsToken: token })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { icsToken: token, updatedAt: new Date() },
    })
  return token
}

export async function userIdForIcsToken(token: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.icsToken, token))
    .limit(1)
  return row?.userId ?? null
}

export async function updateSettings(
  userId: string,
  patch: Partial<SettingsDto>
) {
  await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...patch, updatedAt: new Date() },
    })
  return getSettings(userId)
}
