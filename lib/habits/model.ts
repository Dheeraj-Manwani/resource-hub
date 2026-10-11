import { z } from "zod"
import type { HabitPlanEdit } from "./planning"

export const dateSchema = z.iso
  .date()
  .refine(
    (value) => value >= "1900-01-01" && value <= "2200-12-31",
    "Choose a date between 1900 and 2200"
  )
const timesSchema = z
  .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"))
  .max(8)
  .transform((values) => [...new Set(values)].sort())
export const habitConfigSchema = z
  .object({
    goalType: z.enum(["done", "quantity", "minutes"]),
    target: z.number().positive().max(1000000).multipleOf(0.001),
    unit: z.string().trim().max(30),
    goalPeriod: z.enum(["day", "week", "month"]),
    schedule: z.enum(["daily", "weekdays", "interval", "monthly", "flexible"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    monthDays: z.array(z.number().int().min(1).max(31)).max(31),
    missingDate: z.enum(["skip", "last_day"]),
    intervalDays: z.number().int().min(1).max(365),
    weeklyDays: z.number().int().min(1).max(7),
    startDate: dateSchema,
    endDate: dateSchema.nullable(),
    times: timesSchema,
    reminders: timesSchema,
    defaultDuration: z.number().int().min(1).max(1440),
    weekStart: z.number().int().min(0).max(6),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message })
    if (value.endDate && value.endDate < value.startDate)
      issue("endDate", "End date must follow the start date")
    if (value.schedule === "weekdays" && !value.weekdays.length)
      issue("weekdays", "Choose at least one weekday")
    if (value.schedule === "monthly" && !value.monthDays.length)
      issue("monthDays", "Choose at least one monthly date")
    if (value.goalType === "done" && value.target !== 1)
      issue("target", "Done goals have a target of one")
    if (value.goalType === "quantity" && !value.unit)
      issue("unit", "Give your quantity a unit")
    if (value.schedule === "flexible" && value.goalPeriod !== "day")
      issue(
        "goalPeriod",
        "Flexible habits have a daily goal and a weekly days target"
      )
  })
export type HabitConfig = z.infer<typeof habitConfigSchema>
export const habitStatusSchema = z.enum(["active", "paused", "archived"])
export type HabitStatus = z.infer<typeof habitStatusSchema>
const fields = {
  name: z.string().trim().min(1).max(100),
  reason: z.string().trim().max(500),
  icon: z.enum(["🌱", "📖", "🏃", "💧", "🧘", "🎨", "💪", "🎵"]),
  color: z.enum(["orange", "green", "blue", "violet", "rose"]),
  config: habitConfigSchema,
}
export const createHabitSchema = z.object({ ...fields, id: z.uuid() }).strict()
export const updateHabitSchema = z
  .object({ ...fields, expectedRevision: z.number().int().positive() })
  .strict()
export const statusHabitSchema = z
  .object({
    status: habitStatusSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict()
export const logHabitSchema = z
  .object({
    id: z.uuid(),
    date: dateSchema,
    kind: z.enum(["progress", "skip"]),
    amount: z.number().min(0).max(1000000).multipleOf(0.001),
    notes: z.string().trim().max(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "progress" && value.amount <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Progress must be greater than zero",
      })
    if (value.kind === "skip" && value.amount !== 0)
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "A skip records no progress",
      })
  })
export const editHabitLogSchema = z
  .object({
    amount: z.number().positive().max(1000000).multipleOf(0.001),
    notes: z.string().trim().max(2000),
    expectedRevision: z.number().int().positive(),
  })
  .strict()
export const deleteHabitLogSchema = z
  .object({
    deleted: z.boolean(),
    expectedRevision: z.number().int().positive(),
  })
  .strict()
export type HabitInput = Omit<z.infer<typeof createHabitSchema>, "id">
export type HabitVersion = {
  id: string
  effectiveFrom: string
  revision: number
  config: HabitConfig
}
export type HabitLog = {
  id: string
  versionId: string
  date: string
  periodStart: string
  periodEnd: string
  kind: "progress" | "skip" | "session"
  source?: "manual" | "timer"
  elapsedMs?: number | null
  sessionId?: string | null
  timezone?: string
  amount: number
  notes: string
  revision: number
  deleted: boolean
}
export type Habit = {
  plans?: HabitPlanEdit[]
  lastTimerMinutes?: number | null
  id: string
  name: string
  reason: string
  icon: HabitInput["icon"]
  color: HabitInput["color"]
  status: HabitStatus
  revision: number
  versions: HabitVersion[]
  logs: HabitLog[]
  states: { status: HabitStatus; date: string }[]
}
export type HabitBundle = {
  today: string
  date: string
  timezone: string
  weekStart: number
  items: Habit[]
}

// Calendar arithmetic uses civil dates, independent of DST and the browser's timezone.
export function addDays(date: string, count: number) {
  const result = new Date(`${date}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + count)
  return result.toISOString().slice(0, 10)
}
export function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}
export function todayIn(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}
export function weekDates(date: string, weekStart: number) {
  const start = addDays(date, -((weekday(date) - weekStart + 7) % 7))
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}
export function monthBounds(date: string) {
  const start = `${date.slice(0, 7)}-01`
  const next = new Date(`${start}T12:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { start, end: addDays(next.toISOString().slice(0, 10), -1) }
}
export function isScheduled(config: HabitConfig, date: string) {
  if (date < config.startDate || (config.endDate && date > config.endDate))
    return false
  switch (config.schedule) {
    case "weekdays":
      return config.weekdays.includes(weekday(date))
    case "interval":
      return (
        Math.round(
          (Date.parse(`${date}T12:00Z`) -
            Date.parse(`${config.startDate}T12:00Z`)) /
            86400000
        ) %
          config.intervalDays ===
        0
      )
    case "monthly": {
      const last = Number(monthBounds(date).end.slice(8))
      return config.monthDays.some(
        (day) =>
          (config.missingDate === "last_day" ? Math.min(day, last) : day) ===
          Number(date.slice(8))
      )
    }
    default:
      return true
  }
}
export function versionOn(habit: Pick<Habit, "versions">, date: string) {
  return [...habit.versions]
    .sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) ||
        b.revision - a.revision
    )
    .find((v) => v.effectiveFrom <= date)
}
export function goalPeriod(
  config: HabitConfig,
  date: string,
  effectiveFrom = config.startDate
) {
  const week = weekDates(date, config.weekStart)
  const month = monthBounds(date)
  const start =
    config.goalPeriod === "day"
      ? date
      : config.goalPeriod === "week"
        ? week[0]
        : month.start
  const end =
    config.goalPeriod === "day"
      ? date
      : config.goalPeriod === "week"
        ? week[6]
        : month.end
  return {
    start: [start, config.startDate, effectiveFrom].sort().at(-1)!,
    end: config.endDate && config.endDate < end ? config.endDate : end,
  }
}
export function nextEffectiveDate(
  habit: Pick<Habit, "versions">,
  today: string
) {
  const version = versionOn(habit, today)
  return version
    ? addDays(goalPeriod(version.config, today, version.effectiveFrom).end, 1)
    : today
}
export function progressOn(
  habit: Pick<Habit, "versions" | "logs">,
  date: string
) {
  const version = versionOn(habit, date)
  if (
    !version ||
    date < version.config.startDate ||
    (version.config.endDate && date > version.config.endDate)
  )
    return null
  const period = goalPeriod(version.config, date, version.effectiveFrom)
  const logs = habit.logs.filter(
    (log) =>
      !log.deleted &&
      log.versionId === version.id &&
      log.periodStart === period.start &&
      log.periodEnd === period.end
  )
  const amount =
    Math.round(
      logs.reduce(
        (sum, log) => sum + (log.kind === "progress" ? log.amount : 0),
        0
      ) * 1000
    ) / 1000
  return {
    version,
    period,
    amount,
    target: version.config.target,
    complete: amount >= version.config.target,
    skipped: logs.some((log) => log.kind === "skip") && amount === 0,
    logs,
  }
}
export function flexibleProgress(habit: Habit, date: string) {
  const version = versionOn(habit, date)
  if (!version || version.config.schedule !== "flexible") return null
  const days = weekDates(date, version.config.weekStart).filter(
    (day) => progressOn(habit, day)?.complete
  ).length
  return { days, target: version.config.weeklyDays }
}
export function statusOn(habit: Habit, date: string, today: string) {
  if (date >= today) return habit.status
  return (
    [...habit.states].reverse().find((event) => event.date <= date)?.status ??
    "active"
  )
}
export function upcomingDates(config: HabitConfig, from: string, count = 5) {
  if (config.schedule === "flexible") return []
  const dates: string[] = []
  const start = from > config.startDate ? from : config.startDate
  for (let offset = 0; offset < 740 && dates.length < count; offset++) {
    const date = addDays(start, offset)
    if (config.endDate && date > config.endDate) break
    if (isScheduled(config, date)) dates.push(date)
  }
  return dates
}
export function goalLabel(config: HabitConfig) {
  return config.goalType === "done"
    ? `Done once per ${config.goalPeriod}`
    : `${config.target} ${config.goalType === "minutes" ? "minutes" : config.unit} per ${config.goalPeriod}`
}
export function defaultConfig(today: string, weekStart: number): HabitConfig {
  return {
    goalType: "minutes",
    target: 30,
    unit: "minutes",
    goalPeriod: "day",
    schedule: "daily",
    weekdays: [1, 3, 5],
    monthDays: [1],
    missingDate: "skip",
    intervalDays: 2,
    weeklyDays: 3,
    startDate: today,
    endDate: null,
    times: [],
    reminders: [],
    defaultDuration: 30,
    weekStart,
  }
}
