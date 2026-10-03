import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { userSettings } from "@/lib/db/schema"

export type SettingsDto = {
  timezone: string
  weekStart: number
  libraryView: "grid" | "list" | "focus"
  calendarColorMode: "project" | "priority" | "status"
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
    }
  }
  await db.insert(userSettings).values({ userId }).onConflictDoNothing()
  return {
    timezone: "UTC",
    weekStart: 1,
    libraryView: "grid",
    calendarColorMode: "project",
  }
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
