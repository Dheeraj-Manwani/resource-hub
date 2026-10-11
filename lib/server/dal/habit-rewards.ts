import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { habitMilestones, habitPreferences } from "@/lib/db/schema"
import {
  habitJourney,
  motivationDefaults,
  rewardCandidates,
  type MotivationPreferences,
} from "@/lib/habits/motivation"
import type { Habit } from "@/lib/habits/model"
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function getHabitPreferences(
  userId: string
): Promise<MotivationPreferences> {
  const [row] = await db
    .select()
    .from(habitPreferences)
    .where(eq(habitPreferences.userId, userId))
  if (!row) return { ...motivationDefaults }
  return {
    quiet: row.quiet,
    celebrations: row.celebrations,
    sound: row.sound,
    nudges: row.nudges,
    recaps: row.recaps,
  }
}
export async function updateHabitPreferences(
  userId: string,
  patch: Partial<MotivationPreferences>
) {
  await db
    .insert(habitPreferences)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: habitPreferences.userId,
      set: { ...patch, updatedAt: new Date() },
    })
  return getHabitPreferences(userId)
}
/** Called while the habit row is locked, inside the same transaction as saving work. */
export async function claimHabitRewards(
  tx: Tx,
  before: Habit,
  after: Habit,
  today: string,
  weekStart: number
) {
  const oldJourney = habitJourney(before, today, weekStart),
    journey = habitJourney(after, today, weekStart)
  const candidates = rewardCandidates(oldJourney, journey, today)
  const earned = journey.badges.filter((b) => b.earned)
  if (!earned.length) return { ...candidates, milestones: [] }
  // Existing achievements are remembered silently. Correcting/undoing never resets this ledger.
  const claimed = await tx
    .insert(habitMilestones)
    .values(earned.map((b) => ({ habitId: after.id, key: b.id })))
    .onConflictDoNothing()
    .returning({ key: habitMilestones.key })
  const keys = new Set(claimed.map((b) => b.key))
  return {
    ...candidates,
    milestones: candidates.milestones.filter((b) => keys.has(b.id)),
  }
}
