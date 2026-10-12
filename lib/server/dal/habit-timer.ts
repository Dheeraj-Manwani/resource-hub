import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { uuidv7 } from "uuidv7"
import { db } from "@/lib/db"
import {
  user,
  habits,
  habitTimerSessions,
  habitOccurrences,
  habitLogs,
} from "@/lib/db/schema"
import { ApiError, badRequest, notFound } from "@/lib/server/api"
import { getSettings } from "./settings"
import { claimHabitRewards } from "./habit-rewards"
import type { HabitReward } from "@/lib/habits/motivation"
import { ownedHabit, habitDetails } from "./habits"
import {
  goalPeriod,
  isTimeGoal,
  progressOn,
  timerGoalAmount,
  todayIn,
  versionOn,
} from "@/lib/habits/model"
import {
  applyTimerCommand,
  splitWorkByDate,
  trimSegments,
  type HabitTimer,
  type TimerCommand,
  type TimerSnapshot,
  type StartTimerInput,
} from "@/lib/habits/timer"
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type SessionRow = typeof habitTimerSessions.$inferSelect
const activeStates = ["running", "paused", "review"] as const
function dto(row: SessionRow, habit: typeof habits.$inferSelect): HabitTimer {
  return {
    id: row.id,
    habitId: row.habitId,
    name: habit.name,
    icon: habit.icon,
    timezone: row.timezone,
    mode: row.mode,
    pomodoro: row.pomodoro,
    status: row.status,
    targetMs: row.targetMs,
    runningSince: row.runningSince?.getTime() ?? null,
    segments: row.segments,
    revision: row.revision,
    goal: row.goal,
    lastActionId: row.lastActionId,
    confirmedMs: row.confirmedMs,
  }
}
async function lockAccount(tx: Tx, userId: string) {
  await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .for("update")
}
export async function getHabitTimer(userId: string): Promise<TimerSnapshot> {
  const [row] = await db
    .select({ session: habitTimerSessions, habit: habits })
    .from(habitTimerSessions)
    .innerJoin(habits, eq(habits.id, habitTimerSessions.habitId))
    .where(
      and(
        eq(habitTimerSessions.userId, userId),
        eq(habits.userId, userId),
        inArray(habitTimerSessions.status, [...activeStates])
      )
    )
  return {
    session: row ? dto(row.session, row.habit) : null,
    serverNow: Date.now(),
  }
}
export async function startHabitTimer(userId: string, input: StartTimerInput) {
  const settings = await getSettings(userId)
  return db.transaction(async (tx) => {
    await lockAccount(tx, userId)
    const habit = await ownedHabit(tx, userId, input.habitId, true)
    const [duplicate] = await tx
      .select()
      .from(habitTimerSessions)
      .where(eq(habitTimerSessions.id, input.id))
    if (duplicate) {
      if (duplicate.userId !== userId || duplicate.habitId !== habit.id)
        throw notFound("Timer")
      return {
        session: dto(duplicate, habit),
        serverNow: Date.now(),
        created: false,
      }
    }
    const [active] = await tx
      .select({ id: habitTimerSessions.id })
      .from(habitTimerSessions)
      .where(
        and(
          eq(habitTimerSessions.userId, userId),
          inArray(habitTimerSessions.status, [...activeStates])
        )
      )
    if (active)
      throw new ApiError(
        409,
        "Finish or discard the active timer before starting another habit.",
        "timer_active"
      )
    const now = Date.now(),
      today = todayIn(settings.timezone, new Date(now))
    const definition = await habitDetails(tx, habit, today)
    const progress = progressOn(definition, today)
    if (habit.status !== "active" || !progress)
      throw badRequest("Choose an active habit within its start and end dates")
    const [row] = await tx
      .insert(habitTimerSessions)
      .values({
        id: input.id,
        userId,
        habitId: habit.id,
        timezone: settings.timezone,
        mode: input.mode,
        targetMs:
          input.minutes *
          60000 *
          (input.mode === "pomodoro" ? input.rounds! : 1),
        pomodoro:
          input.mode === "pomodoro"
            ? {
                workMs: input.minutes * 60000,
                breakMs: input.breakMinutes! * 60000,
                rounds: input.rounds!,
                round: 1,
                phase: "work",
                workStartMs: 0,
                breakElapsedMs: 0,
                breakSince: null,
              }
            : null,
        runningSince: new Date(now),
        goal: progress.version.config,
      })
      .returning()
    await tx
      .update(habits)
      .set({ lastTimerMinutes: input.minutes })
      .where(eq(habits.id, habit.id))
    return { session: dto(row, habit), serverNow: now, created: true }
  })
}
export async function commandHabitTimer(
  userId: string,
  id: string,
  command: TimerCommand
) {
  const rewardSettings =
    command.action === "finish" ? await getSettings(userId) : null
  return db.transaction(async (tx) => {
    await lockAccount(tx, userId)
    const [row] = await tx
      .select()
      .from(habitTimerSessions)
      .where(
        and(
          eq(habitTimerSessions.id, id),
          eq(habitTimerSessions.userId, userId)
        )
      )
      .for("update")
    if (!row) throw notFound("Timer")
    const habit = await ownedHabit(tx, userId, row.habitId, true)
    const current = dto(row, habit)
    if (row.lastActionId === command.id)
      return {
        session: current,
        serverNow: Date.now(),
        saved: false,
        completed: false,
      }
    if (row.revision !== command.expectedRevision)
      throw new ApiError(
        409,
        "This timer changed on another tab or device. Review its latest state.",
        "timer_conflict"
      )
    const now = Date.now()
    let next: HabitTimer
    try {
      next = applyTimerCommand(current, command, now)
    } catch (error) {
      throw badRequest(
        error instanceof Error ? error.message : "Invalid timer change"
      )
    }
    let completed = false
    let reward: HabitReward | undefined
    if (command.action === "finish") {
      const before = await habitDetails(tx, habit, "1900-01-01", "2200-12-31")
      const work = splitWorkByDate(
        trimSegments(next.segments, command.confirmedMs),
        row.timezone
      )
      for (const part of work) {
        const definition = await habitDetails(tx, habit, part.date)
        const version = versionOn(definition, part.date)
        if (!version)
          throw badRequest("The habit's historical schedule is unavailable")
        const eligible =
          part.date >= version.config.startDate &&
          (!version.config.endDate || part.date <= version.config.endDate)
        const amount =
          eligible && isTimeGoal(row.goal) && isTimeGoal(version.config)
            ? timerGoalAmount(version.config, part.elapsedMs)
            : 0
        const period = eligible
          ? goalPeriod(version.config, part.date, version.effectiveFrom)
          : { start: part.date, end: part.date }
        await tx
          .insert(habitOccurrences)
          .values({
            id: uuidv7(),
            habitId: habit.id,
            versionId: version.id,
            periodStart: period.start,
            periodEnd: period.end,
          })
          .onConflictDoNothing()
        const [occurrence] = await tx
          .select()
          .from(habitOccurrences)
          .where(
            and(
              eq(habitOccurrences.habitId, habit.id),
              eq(habitOccurrences.versionId, version.id),
              eq(habitOccurrences.periodStart, period.start),
              eq(habitOccurrences.periodEnd, period.end)
            )
          )
        await tx.insert(habitLogs).values({
          id: uuidv7(),
          habitId: habit.id,
          occurrenceId: occurrence.id,
          date: part.date,
          kind: amount > 0 ? "progress" : "session",
          amount,
          elapsedMs: part.elapsedMs,
          source: "timer",
          sessionId: row.id,
          notes: command.notes,
          timezone: row.timezone,
        })
        const after = progressOn(
          await habitDetails(tx, habit, part.date),
          part.date
        )
        if (after?.complete && !occurrence.celebratedAt && amount > 0) {
          await tx
            .update(habitOccurrences)
            .set({ celebratedAt: new Date(now) })
            .where(eq(habitOccurrences.id, occurrence.id))
          completed = true
        }
      }
      reward = await claimHabitRewards(
        tx,
        before,
        await habitDetails(tx, habit, "1900-01-01", "2200-12-31"),
        todayIn(rewardSettings!.timezone, new Date(now)),
        rewardSettings!.weekStart
      )
    }
    const [updated] = await tx
      .update(habitTimerSessions)
      .set({
        status: next.status,
        pomodoro: next.pomodoro,
        targetMs: next.targetMs,
        runningSince:
          next.runningSince === null ? null : new Date(next.runningSince),
        segments: next.segments,
        revision: next.revision,
        lastActionId: command.id,
        confirmedMs: next.confirmedMs,
        ...(command.action === "finish" ? { notes: command.notes } : {}),
      })
      .where(eq(habitTimerSessions.id, id))
      .returning()
    return {
      session: dto(updated, habit),
      serverNow: now,
      saved: command.action === "finish",
      completed,
      reward,
    }
  })
}
