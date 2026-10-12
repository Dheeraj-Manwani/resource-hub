import "server-only"
import { isDeepStrictEqual } from "node:util"
import { and, asc, eq, gte, lte } from "drizzle-orm"
import { uuidv7 } from "uuidv7"
import { db } from "@/lib/db"
import {
  habits,
  habitVersions,
  habitOccurrences,
  habitLogs,
  habitStates,
  habitPlanEdits,
} from "@/lib/db/schema"
import { ApiError, badRequest, notFound } from "@/lib/server/api"
import { getSettings } from "./settings"
import { claimHabitRewards } from "./habit-rewards"
import {
  addDays,
  goalPeriod,
  goalMinutes,
  isTimeGoal,
  monthBounds,
  nextEffectiveDate,
  progressOn,
  statusOn,
  todayIn,
  versionOn,
  type Habit,
  type HabitBundle,
  type HabitInput,
  type HabitLog,
  type HabitStatus,
} from "@/lib/habits/model"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
function conflict() {
  throw new ApiError(
    409,
    "This record changed elsewhere. Refresh and try again.",
    "conflict"
  )
}
async function owned(tx: Tx, userId: string, id: string, lock = false) {
  const query = tx
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
  const [row] = lock ? await query.for("update") : await query
  if (!row) throw notFound("Habit")
  return row!
}
async function details(
  tx: Tx,
  row: typeof habits.$inferSelect,
  date: string,
  through = date
): Promise<Habit> {
  const month = monthBounds(date)
  const [versions, logs, states, plans] = await Promise.all([
    tx
      .select()
      .from(habitVersions)
      .where(eq(habitVersions.habitId, row.id))
      .orderBy(asc(habitVersions.effectiveFrom), asc(habitVersions.revision)),
    tx
      .select({
        id: habitLogs.id,
        versionId: habitOccurrences.versionId,
        date: habitLogs.date,
        periodStart: habitOccurrences.periodStart,
        periodEnd: habitOccurrences.periodEnd,
        kind: habitLogs.kind,
        amount: habitLogs.amount,
        notes: habitLogs.notes,
        revision: habitLogs.revision,
        deletedAt: habitLogs.deletedAt,
        source: habitLogs.source,
        elapsedMs: habitLogs.elapsedMs,
        sessionId: habitLogs.sessionId,
        timezone: habitLogs.timezone,
      })
      .from(habitLogs)
      .innerJoin(
        habitOccurrences,
        eq(habitLogs.occurrenceId, habitOccurrences.id)
      )
      .where(
        and(
          eq(habitLogs.habitId, row.id),
          gte(habitLogs.date, addDays(month.start, -7)),
          lte(habitLogs.date, addDays(monthBounds(through).end, 7))
        )
      )
      .orderBy(asc(habitLogs.date), asc(habitLogs.createdAt)),
    tx
      .select({ status: habitStates.status, date: habitStates.date })
      .from(habitStates)
      .where(eq(habitStates.habitId, row.id))
      .orderBy(asc(habitStates.createdAt), asc(habitStates.id)),
    tx
      .select({
        id: habitPlanEdits.id,
        revision: habitPlanEdits.revision,
        versionId: habitPlanEdits.versionId,
        scope: habitPlanEdits.scope,
        sourceDate: habitPlanEdits.sourceDate,
        sourceSlot: habitPlanEdits.sourceSlot,
        date: habitPlanEdits.date,
        time: habitPlanEdits.time,
        minutes: habitPlanEdits.minutes,
        canceled: habitPlanEdits.canceled,
      })
      .from(habitPlanEdits)
      .where(eq(habitPlanEdits.habitId, row.id))
      .orderBy(asc(habitPlanEdits.revision)),
  ])
  return {
    id: row.id,
    name: row.name,
    reason: row.reason,
    icon: row.icon,
    color: row.color,
    status: row.status,
    revision: row.revision,
    lastTimerMinutes: row.lastTimerMinutes,
    plans,
    versions: versions.map((v) => ({
      id: v.id,
      revision: v.revision,
      effectiveFrom: v.effectiveFrom,
      config: v.config,
    })),
    logs: logs.map(({ deletedAt, ...log }) => ({
      ...log,
      deleted: !!deletedAt,
    })),
    states,
  }
}
export async function listHabits(
  userId: string,
  requestedDate?: string,
  through?: string
): Promise<HabitBundle> {
  const settings = await getSettings(userId)
  const today = todayIn(settings.timezone)
  const date = requestedDate ?? today
  const items = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(habits)
      .where(eq(habits.userId, userId))
      .orderBy(asc(habits.createdAt))
    return Promise.all(rows.map((row) => details(tx, row, date, through)))
  })
  return {
    today,
    date,
    timezone: settings.timezone,
    weekStart: settings.weekStart,
    items,
  }
}
export async function createHabit(
  userId: string,
  input: HabitInput & { id: string }
) {
  return db.transaction(async (tx) => {
    const { config, ...fields } = input
    const [row] = await tx
      .insert(habits)
      .values({ ...fields, userId })
      .onConflictDoNothing()
      .returning()
    if (!row)
      return {
        habit: await details(
          tx,
          await owned(tx, userId, input.id),
          config.startDate
        ),
        created: false,
      }
    await tx.insert(habitVersions).values({
      id: uuidv7(),
      habitId: row.id,
      revision: 1,
      effectiveFrom: config.startDate,
      config,
    })
    await tx.insert(habitStates).values({
      id: uuidv7(),
      habitId: row.id,
      status: "active",
      date: config.startDate,
    })
    return { habit: await details(tx, row, config.startDate), created: true }
  })
}
export async function updateHabit(
  userId: string,
  id: string,
  input: HabitInput & { expectedRevision: number }
) {
  const settings = await getSettings(userId)
  const today = todayIn(settings.timezone)
  return db.transaction(async (tx) => {
    const row = await owned(tx, userId, id, true)
    if (row.revision !== input.expectedRevision) conflict()
    const habit = await details(tx, row, today)
    const latest = habit.versions.at(-1)!
    const revision = row.revision + 1
    let effectiveFrom: string | undefined
    if (!isDeepStrictEqual(latest.config, input.config)) {
      effectiveFrom =
        latest.effectiveFrom > today
          ? latest.effectiveFrom
          : nextEffectiveDate(habit, today)
      if (effectiveFrom <= today) effectiveFrom = addDays(today, 1)
      if (input.config.endDate && input.config.endDate < effectiveFrom)
        throw badRequest(
          `The updated schedule must end on or after ${effectiveFrom}`
        )
      await tx.insert(habitVersions).values({
        id: uuidv7(),
        habitId: id,
        revision,
        effectiveFrom,
        config: input.config,
      })
    }
    const [updated] = await tx
      .update(habits)
      .set({
        name: input.name,
        reason: input.reason,
        icon: input.icon,
        color: input.color,
        revision,
      })
      .where(eq(habits.id, id))
      .returning()
    return { habit: await details(tx, updated, today), effectiveFrom }
  })
}
export async function setHabitStatus(
  userId: string,
  id: string,
  status: HabitStatus,
  expectedRevision: number
) {
  const today = todayIn((await getSettings(userId)).timezone)
  return db.transaction(async (tx) => {
    const row = await owned(tx, userId, id, true)
    if (row.revision !== expectedRevision) conflict()
    if (row.status !== status) {
      await tx
        .insert(habitStates)
        .values({ id: uuidv7(), habitId: id, status, date: today })
      await tx
        .update(habits)
        .set({ status, revision: row.revision + 1 })
        .where(eq(habits.id, id))
    }
    return { status }
  })
}
export async function addHabitLog(
  userId: string,
  id: string,
  input: {
    id: string
    date: string
    kind: "progress" | "skip"
    amount: number
    notes: string
  }
) {
  const settings = await getSettings(userId)
  const today = todayIn(settings.timezone)
  return db.transaction(async (tx) => {
    const row = await owned(tx, userId, id, true)
    const habit = await details(tx, row, "1900-01-01", "2200-12-31")
    const existing = habit.logs.find((log) => log.id === input.id)
    if (existing) {
      if (
        existing.date !== input.date ||
        existing.amount !== input.amount ||
        existing.kind !== input.kind ||
        existing.notes !== input.notes
      )
        conflict()
      return { log: existing, created: false, completed: false }
    }
    // An id reused outside the requested date window must never create another entry.
    const [duplicate] = await tx
      .select({ id: habitLogs.id })
      .from(habitLogs)
      .where(eq(habitLogs.id, input.id))
    if (duplicate) conflict()
    if (input.date > today)
      throw badRequest(
        "Future dates are plans. Log progress after doing the habit."
      )
    const version = versionOn(habit, input.date)
    if (
      !version ||
      input.date < version.config.startDate ||
      (version.config.endDate && input.date > version.config.endDate)
    )
      throw badRequest("Choose a date within the habit's schedule")
    if (statusOn(habit, input.date, today) !== "active")
      throw badRequest("Resume the habit before adding progress on this date")
    const before = progressOn(habit, input.date)!
    if (
      input.kind === "progress" &&
      version!.config.goalType === "done" &&
      (input.amount !== 1 || before.complete)
    )
      throw badRequest("This goal can be marked done once per period")
    const period = goalPeriod(
      version!.config,
      input.date,
      version!.effectiveFrom
    )
    const occurrenceId = uuidv7()
    await tx
      .insert(habitOccurrences)
      .values({
        id: occurrenceId,
        habitId: id,
        versionId: version!.id,
        periodStart: period.start,
        periodEnd: period.end,
      })
      .onConflictDoNothing()
    const [occurrence] = await tx
      .select()
      .from(habitOccurrences)
      .where(
        and(
          eq(habitOccurrences.habitId, id),
          eq(habitOccurrences.versionId, version!.id),
          eq(habitOccurrences.periodStart, period.start),
          eq(habitOccurrences.periodEnd, period.end)
        )
      )
    await tx.insert(habitLogs).values({
      ...input,
      habitId: id,
      occurrenceId: occurrence.id,
      timezone: settings.timezone,
    })
    const afterHabit = await details(tx, row, "1900-01-01", "2200-12-31")
    const after = progressOn(afterHabit, input.date)!
    const completed =
      !before.complete && after.complete && !occurrence.celebratedAt
    if (completed)
      await tx
        .update(habitOccurrences)
        .set({ celebratedAt: new Date() })
        .where(eq(habitOccurrences.id, occurrence.id))
    return {
      log: afterHabit.logs.find((log) => log.id === input.id)!,
      created: true,
      completed,
      reward:
        input.kind === "progress"
          ? await claimHabitRewards(
              tx,
              habit,
              afterHabit,
              today,
              settings.weekStart
            )
          : { milestones: [], returning: false },
      progress: { amount: after.amount, target: after.target },
    }
  })
}
export async function changeHabitLog(
  userId: string,
  id: string,
  logId: string,
  input: {
    expectedRevision: number
    amount?: number
    notes?: string
    deleted?: boolean
  }
): Promise<{ log: HabitLog }> {
  return db.transaction(async (tx) => {
    const row = await owned(tx, userId, id, true)
    const [log] = await tx
      .select()
      .from(habitLogs)
      .where(and(eq(habitLogs.id, logId), eq(habitLogs.habitId, id)))
    if (!log) throw notFound("Habit entry")
    if (log.revision !== input.expectedRevision) conflict()
    const habit = await details(tx, row, log.date)
    const dto = habit.logs.find((entry) => entry.id === logId)!
    const version = habit.versions.find((v) => v.id === dto.versionId)!
    if (
      input.amount !== undefined &&
      (log.kind !== "progress" ||
        (version.config.goalType === "done" && input.amount !== 1))
    )
      throw badRequest("This entry's goal type cannot be changed")
    if (
      input.deleted === false &&
      log.kind === "progress" &&
      version.config.goalType === "done" &&
      progressOn(habit, log.date)?.complete
    )
      throw badRequest("This period already has a completed entry")
    const [updated] = await tx
      .update(habitLogs)
      .set({
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.amount !== undefined &&
        log.source === "timer" &&
        isTimeGoal(version.config)
          ? {
              elapsedMs: Math.round(
                goalMinutes(version.config, input.amount) * 60000
              ),
            }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.deleted !== undefined
          ? { deletedAt: input.deleted ? new Date() : null }
          : {}),
        revision: log.revision + 1,
      })
      .where(eq(habitLogs.id, logId))
      .returning()
    return {
      log: {
        ...dto,
        amount: updated.amount,
        notes: updated.notes,
        deleted: !!updated.deletedAt,
        revision: updated.revision,
        elapsedMs: updated.elapsedMs,
      },
    }
  })
}
export { owned as ownedHabit, details as habitDetails }
