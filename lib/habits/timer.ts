import { z } from "zod"
import { todayIn, type HabitConfig } from "./model"

export const MAX_TIMER_MS = 24 * 60 * 60 * 1000
export type WorkSegment = { start: number; end: number }
export type TimerStatus =
  "running" | "paused" | "review" | "finished" | "discarded"
export type HabitTimer = {
  id: string
  habitId: string
  name: string
  icon: string
  timezone: string
  mode: "countdown" | "stopwatch"
  status: TimerStatus
  targetMs: number
  runningSince: number | null
  segments: WorkSegment[]
  revision: number
  goal: HabitConfig
  lastActionId: string | null
  confirmedMs: number | null
}
export type TimerSnapshot = { session: HabitTimer | null; serverNow: number }
export const startTimerSchema = z
  .object({
    id: z.uuid(),
    habitId: z.uuid(),
    mode: z.enum(["countdown", "stopwatch"]),
    minutes: z.number().int().min(1).max(1440),
  })
  .strict()
const commandFields = {
  id: z.uuid(),
  expectedRevision: z.number().int().positive(),
  at: z.number().int().nonnegative(),
}
export const timerCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...commandFields,
      action: z.enum(["pause", "resume", "review", "discard"]),
    })
    .strict(),
  z
    .object({
      ...commandFields,
      action: z.literal("add_time"),
      minutes: z.number().int().min(1).max(1440),
    })
    .strict(),
  z
    .object({
      ...commandFields,
      action: z.literal("finish"),
      confirmedMs: z.number().int().min(1000).max(MAX_TIMER_MS),
      notes: z.string().trim().max(2000),
    })
    .strict(),
])
export type TimerCommand = z.infer<typeof timerCommandSchema>
export const isActiveTimer = (status: TimerStatus) =>
  status === "running" || status === "paused" || status === "review"
export function segmentTotal(segments: WorkSegment[]) {
  return segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.end - segment.start),
    0
  )
}
export function timerSegments(timer: HabitTimer, now: number): WorkSegment[] {
  const saved = segmentTotal(timer.segments)
  const limit = timer.mode === "countdown" ? timer.targetMs : MAX_TIMER_MS
  if (
    timer.status !== "running" ||
    timer.runningSince === null ||
    saved >= limit
  )
    return timer.segments
  const end = Math.min(
    Math.max(now, timer.runningSince),
    timer.runningSince + limit - saved
  )
  return [...timer.segments, { start: timer.runningSince, end }].filter(
    (segment) => segment.end > segment.start
  )
}
export function timerElapsed(timer: HabitTimer, now: number) {
  return segmentTotal(timerSegments(timer, now))
}
export function applyTimerCommand(
  timer: HabitTimer,
  command: TimerCommand,
  now: number
): HabitTimer {
  if (timer.lastActionId === command.id) return timer
  if (!isActiveTimer(timer.status))
    throw new Error("This timer has already ended")
  if (timer.revision !== command.expectedRevision)
    throw new Error(
      "This timer changed on another tab or device. Review its latest state."
    )
  const lastEnd = timer.segments.at(-1)?.end ?? 0
  const at = Math.max(lastEnd, Math.min(command.at, now))
  const next = {
    ...timer,
    revision: timer.revision + 1,
    lastActionId: command.id,
  }
  if (command.action === "resume") {
    if (timer.status === "running")
      throw new Error("The timer is already running")
    if (
      timerElapsed(timer, at) >=
      (timer.mode === "countdown" ? timer.targetMs : MAX_TIMER_MS)
    )
      throw new Error("Add time before resuming a finished countdown")
    return { ...next, status: "running", runningSince: at }
  }
  if (command.action === "add_time") {
    if (timer.mode !== "countdown")
      throw new Error("A stopwatch does not need extra time")
    const targetMs = timer.targetMs + command.minutes * 60000
    if (targetMs > MAX_TIMER_MS)
      throw new Error("A session can track up to 24 hours")
    // If a countdown expired, the gap before adding time is not working time.
    const segments = timerSegments(timer, at)
    return {
      ...next,
      targetMs,
      segments,
      runningSince: timer.status === "running" ? at : null,
    }
  }
  if (command.action === "pause" && timer.status !== "running")
    throw new Error("The timer is already paused")
  const segments = timerSegments(timer, at)
  if (segments.length > 1000)
    throw new Error("Finish this session before adding more intervals")
  const status: TimerStatus =
    command.action === "finish"
      ? "finished"
      : command.action === "discard"
        ? "discarded"
        : command.action === "review"
          ? "review"
          : "paused"
  if (
    command.action === "finish" &&
    command.confirmedMs > segmentTotal(segments)
  )
    throw new Error("Confirmed work cannot exceed tracked time")
  return {
    ...next,
    segments,
    runningSince: null,
    status,
    confirmedMs:
      command.action === "finish" ? command.confirmedMs : timer.confirmedMs,
  }
}
export function trimSegments(segments: WorkSegment[], confirmedMs: number) {
  let remaining = confirmedMs
  const result: WorkSegment[] = []
  for (const segment of segments) {
    const length = Math.min(remaining, Math.max(0, segment.end - segment.start))
    if (length > 0)
      result.push({ start: segment.start, end: segment.start + length })
    remaining -= length
    if (remaining <= 0) break
  }
  return result
}
export function splitWorkByDate(segments: WorkSegment[], timezone: string) {
  const totals = new Map<string, number>()
  for (const segment of segments) {
    let start = segment.start
    while (start < segment.end) {
      const date = todayIn(timezone, new Date(start))
      let end = segment.end
      if (todayIn(timezone, new Date(end - 1)) !== date) {
        // Locate civil midnight; this also handles 23/25-hour DST days.
        let low = start,
          high = Math.min(end, start + 36 * 3600000)
        while (high - low > 1) {
          const mid = Math.floor((low + high) / 2)
          if (todayIn(timezone, new Date(mid)) === date) low = mid
          else high = mid
        }
        end = high
      }
      totals.set(date, (totals.get(date) ?? 0) + end - start)
      start = end
    }
  }
  return [...totals].map(([date, elapsedMs]) => ({ date, elapsedMs }))
}
export function formatTimer(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  return `${hours ? `${hours}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}
