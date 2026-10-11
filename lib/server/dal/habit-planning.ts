import "server-only"
import { isDeepStrictEqual } from "node:util"
import { and, eq, inArray } from "drizzle-orm"
import { uuidv7 } from "uuidv7"
import { db } from "@/lib/db"
import { habits, habitPlanEdits, habitReminderStates } from "@/lib/db/schema"
import { ApiError, badRequest, notFound } from "@/lib/server/api"
import { addDays, progressOn, todayIn, versionOn } from "@/lib/habits/model"
import {
  calendarBlocks,
  dayDistance,
  dueHabitReminderRows,
  flexibleTargets,
  reminderCandidates,
  type HabitPlanInput,
  type HabitReminderAction,
} from "@/lib/habits/planning"
import { habitDetails, listHabits, ownedHabit } from "./habits"
import { getSettings } from "./settings"

export async function habitCalendar(userId: string, from: string, to: string) {
  const bundle = await listHabits(userId, from, to)
  return {
    ...bundle,
    blocks: bundle.items.flatMap((habit) =>
      calendarBlocks(habit, from, to, bundle.today, bundle.timezone)
    ),
    flexible: bundle.items.flatMap((habit) =>
      flexibleTargets(habit, from, to, bundle.today)
    ),
  }
}
export async function saveHabitPlan(
  userId: string,
  id: string,
  input: HabitPlanInput
) {
  const settings = await getSettings(userId),
    today = todayIn(settings.timezone)
  return db.transaction(async (tx) => {
    const row = await ownedHabit(tx, userId, id, true)
    const [duplicate] = await tx
      .select()
      .from(habitPlanEdits)
      .where(eq(habitPlanEdits.id, input.id))
    if (duplicate) {
      if (duplicate.habitId !== id) throw notFound("Plan")
      if (!isDeepStrictEqual(duplicate.request, input))
        throw new ApiError(
          409,
          "This plan save differs from the earlier request",
          "conflict"
        )
      return { created: false, plan: duplicate }
    }
    if (row.revision !== input.expectedRevision)
      throw new ApiError(
        409,
        "This habit changed elsewhere. Refresh and try again.",
        "conflict"
      )
    if (row.status !== "active" || input.date < today)
      throw badRequest("Plan an active habit for today or a future date")
    const habit = await habitDetails(tx, row, "1900-01-01", "2200-12-31")
    const target = progressOn(habit, input.date)
    if (!target) throw badRequest("Choose a date within the habit's schedule")
    if (
      target.complete ||
      habit.logs.some((log) => !log.deleted && log.date === input.date)
    )
      throw badRequest(
        "Recorded days stay unchanged. Choose another day for this plan."
      )
    let sourceDate = input.date,
      sourceSlot = `extra:${input.id}`,
      version = versionOn(habit, input.date)!
    if (input.scope !== "extra") {
      if (Math.abs(dayDistance(input.sourceDate, input.date)) > 366)
        throw badRequest("Move a plan by at most one year")
      const current = calendarBlocks(
        habit,
        addDays(input.sourceDate, -366),
        addDays(input.sourceDate, 366),
        today,
        settings.timezone
      ).find(
        (block) =>
          block.versionId === input.versionId &&
          block.sourceDate === input.sourceDate &&
          block.sourceSlot === input.sourceSlot
      )
      if (!current || !current.editable)
        throw badRequest(
          "This occurrence is no longer editable. Recorded history stays unchanged."
        )
      if (
        input.scope === "following" &&
        (input.sourceSlot.startsWith("extra:") || input.canceled)
      )
        throw badRequest(
          "A chosen day can be changed individually; cancel one occurrence at a time"
        )
      sourceDate = input.sourceDate
      sourceSlot = input.sourceSlot
      version = habit.versions.find((v) => v.id === input.versionId)!
    }
    let revision = row.revision + 1
    // Future rules must not move other occurrences that already have work.
    if (input.scope === "following") {
      const firstRecordedDate =
        habit.logs
          .filter((log) => !log.deleted)
          .map((log) => log.date)
          .sort()[0] ?? today
      const protectedBlocks = calendarBlocks(
        habit,
        firstRecordedDate,
        today,
        today,
        settings.timezone
      ).filter(
        (block) =>
          block.versionId === version.id &&
          block.sourceSlot === sourceSlot &&
          block.sourceDate >= sourceDate &&
          !block.editable
      )
      for (const block of protectedBlocks) {
        await tx.insert(habitPlanEdits).values({
          id: uuidv7(),
          habitId: id,
          versionId: version.id,
          revision: revision++,
          scope: "this",
          sourceDate: block.sourceDate,
          sourceSlot: block.sourceSlot,
          date: block.date,
          time: block.time,
          minutes: block.minutes,
          canceled: false,
          request: input,
        })
      }
      // The selected occurrence must receive the requested change even when
      // it already has an individual override. Other individual plans stay put.
      if (
        habit.plans?.some(
          (plan) =>
            plan.scope === "this" &&
            plan.versionId === version.id &&
            plan.sourceDate === sourceDate &&
            plan.sourceSlot === sourceSlot
        )
      ) {
        await tx.insert(habitPlanEdits).values({
          id: uuidv7(),
          habitId: id,
          versionId: version.id,
          revision: revision++,
          scope: "this",
          sourceDate,
          sourceSlot,
          date: input.date,
          time: input.time,
          minutes: input.minutes,
          canceled: false,
          request: input,
        })
      }
    }
    const nextRevision = revision
    const [plan] = await tx
      .insert(habitPlanEdits)
      .values({
        id: input.id,
        habitId: id,
        versionId: version.id,
        revision: nextRevision,
        scope: input.scope,
        sourceDate,
        sourceSlot,
        date: input.date,
        time: input.time,
        minutes: input.minutes,
        canceled: input.scope !== "extra" && input.canceled,
        request: input,
      })
      .returning()
    await tx
      .update(habits)
      .set({ revision: nextRevision })
      .where(eq(habits.id, id))
    return { created: true, plan }
  })
}
export async function dueHabitReminders(userId: string, now = new Date()) {
  const settings = await getSettings(userId),
    today = todayIn(settings.timezone, now)
  const bundle = await listHabits(userId, addDays(today, -1), today)
  if (!bundle.items.length) return []
  const states = await db
    .select()
    .from(habitReminderStates)
    .where(
      inArray(
        habitReminderStates.habitId,
        bundle.items.map((habit) => habit.id)
      )
    )
  return bundle.items
    .flatMap((habit) =>
      dueHabitReminderRows(
        habit,
        states
          .filter((s) => s.habitId === habit.id)
          .map((s) => ({
            ...s,
            dismissedAt: s.dismissedAt?.toISOString() ?? null,
            snoozedUntil: s.snoozedUntil?.toISOString() ?? null,
          })),
        now,
        settings.timezone
      )
    )
    .sort((a, b) => a.notifyAt.localeCompare(b.notifyAt))
}
export async function actOnHabitReminder(
  userId: string,
  id: string,
  input: HabitReminderAction
) {
  const settings = await getSettings(userId),
    now = new Date(),
    today = todayIn(settings.timezone, now)
  return db.transaction(async (tx) => {
    const row = await ownedHabit(tx, userId, id, true)
    const habit = await habitDetails(tx, row, input.date)
    const candidate = reminderCandidates(
      habit,
      input.date,
      input.date,
      today,
      settings.timezone
    ).find((r) => r.versionId === input.versionId && r.time === input.time)
    if (
      !candidate ||
      input.date > today ||
      Date.parse(candidate.fireAt) > now.getTime() ||
      Date.parse(candidate.fireAt) < now.getTime() - 86400000
    )
      throw badRequest("This reminder is no longer due")
    const key = and(
      eq(habitReminderStates.habitId, id),
      eq(habitReminderStates.versionId, input.versionId),
      eq(habitReminderStates.date, input.date),
      eq(habitReminderStates.time, input.time)
    )
    const [existing] = await tx.select().from(habitReminderStates).where(key)
    if (existing?.lastActionId === input.id) return { saved: false }
    if (existing?.dismissedAt && input.action === "snooze")
      throw badRequest("This reminder has been dismissed")
    await tx
      .insert(habitReminderStates)
      .values({
        id: uuidv7(),
        habitId: id,
        versionId: input.versionId,
        date: input.date,
        time: input.time,
        lastActionId: input.id,
        dismissedAt: input.action === "dismiss" ? now : null,
        snoozedUntil:
          input.action === "snooze"
            ? new Date(now.getTime() + input.minutes! * 60000)
            : null,
      })
      .onConflictDoUpdate({
        target: [
          habitReminderStates.habitId,
          habitReminderStates.versionId,
          habitReminderStates.date,
          habitReminderStates.time,
        ],
        set: {
          lastActionId: input.id,
          dismissedAt: input.action === "dismiss" ? now : existing?.dismissedAt,
          snoozedUntil:
            input.action === "snooze"
              ? new Date(now.getTime() + input.minutes! * 60000)
              : null,
        },
      })
    return { saved: true }
  })
}
