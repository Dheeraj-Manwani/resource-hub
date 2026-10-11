import { TZDate } from "@date-fns/tz"
import { z } from "zod"
import {
  addDays,
  dateSchema,
  flexibleProgress,
  goalLabel,
  isScheduled,
  progressOn,
  statusOn,
  todayIn,
  versionOn,
  weekDates,
  type Habit,
} from "./model"

export const habitColors = {
  orange: "#f97316",
  green: "#22c55e",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  rose: "#f43f5e",
}
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const habitRangeSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine(
    ({ from, to }) => to >= from && dayDistance(from, to) <= 93,
    "Choose a range of up to 93 days"
  )
const planFields = {
  id: z.uuid(),
  expectedRevision: z.number().int().positive(),
  date: dateSchema,
  time: timeSchema.nullable(),
  minutes: z.number().int().min(1).max(1440),
}
export const habitPlanSchema = z.discriminatedUnion("scope", [
  z.object({ ...planFields, scope: z.literal("extra") }).strict(),
  z
    .object({
      ...planFields,
      scope: z.enum(["this", "following"]),
      versionId: z.uuid(),
      sourceDate: dateSchema,
      sourceSlot: z
        .string()
        .regex(/^(all-day|time:([01]\d|2[0-3]):[0-5]\d|extra:[0-9a-f-]{36})$/),
      canceled: z.boolean().default(false),
    })
    .strict(),
])
export type HabitPlanInput = z.infer<typeof habitPlanSchema>
export type HabitPlanEdit = {
  id: string
  revision: number
  versionId: string
  scope: "this" | "following" | "extra"
  sourceDate: string
  sourceSlot: string
  date: string
  time: string | null
  minutes: number
  canceled: boolean
}
export type HabitCalendarBlock = {
  kind: "habit"
  id: string
  habitId: string
  title: string
  icon: string
  color: string
  versionId: string
  sourceDate: string
  sourceSlot: string
  date: string
  time: string | null
  minutes: number
  start: string
  end: string | null
  allDay: boolean
  amount: number
  target: number
  goal: string
  recordedMinutes: number
  complete: boolean
  partial: boolean
  skipped: boolean
  editable: boolean
}
export type FlexibleHabitTarget = {
  habitId: string
  versionId: string
  name: string
  icon: string
  start: string
  end: string
  days: number
  target: number
  planDate: string | null
}
export function dayDistance(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T12:00Z`) - Date.parse(`${from}T12:00Z`)) / 86400000
  )
}
export function wallTime(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number),
    [hour, minute] = time.split(":").map(Number)
  return new TZDate(year, month - 1, day, hour, minute, 0, 0, timezone)
}
export function civilTime(instant: Date, timezone: string) {
  const date = new TZDate(instant, timezone)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}
export function recordedMinutes(habit: Habit, date: string) {
  return (
    Math.round(
      habit.logs.reduce((sum, log) => {
        if (log.deleted || log.date !== date) return sum
        if (log.source === "timer") return sum + (log.elapsedMs ?? 0) / 60000
        const version = habit.versions.find((v) => v.id === log.versionId)
        return (
          sum +
          (log.kind === "progress" && version?.config.goalType === "minutes"
            ? log.amount
            : 0)
        )
      }, 0) * 1000
    ) / 1000
  )
}
export type HabitPlannedSlot = Pick<HabitCalendarBlock, "versionId" | "sourceDate" | "sourceSlot" | "date" | "time" | "minutes">
export function plannedHabitSlots(
  habit: Habit,
  from: string,
  to: string,
  today: string
): HabitPlannedSlot[] {
  const edits = [...(habit.plans ?? [])].sort((a, b) => b.revision - a.revision)
  const result: HabitPlannedSlot[] = []
  function add(
    versionId: string,
    sourceDate: string,
    sourceSlot: string,
    date: string,
    time: string | null,
    minutes: number
  ) {
    if (date < from || date > to || statusOn(habit, date, today) !== "active")
      return
    const current = versionOn(habit, date)
    if (!current || date < current.config.startDate || (current.config.endDate && date > current.config.endDate)) return
    result.push({
      versionId,
      sourceDate,
      sourceSlot,
      date,
      time,
      minutes,
    })
  }
  // Future planning rules may move an occurrence by up to one year.
  const padding = Math.max(
    0,
    ...edits
      .filter((edit) => edit.scope === "following")
      .map((edit) => Math.abs(dayDistance(edit.sourceDate, edit.date)))
  )
  const sources = new Set<string>()
  for (
    let date = addDays(from, -padding);
    date <= addDays(to, padding);
    date = addDays(date, 1)
  )
    sources.add(date)
  for (const edit of edits)
    if (edit.scope === "this" && edit.date >= from && edit.date <= to)
      sources.add(edit.sourceDate)
  for (const sourceDate of [...sources].sort()) {
    const version = versionOn(habit, sourceDate)
    if (
      !version ||
      version.config.schedule === "flexible" ||
      !isScheduled(version.config, sourceDate) ||
      statusOn(habit, sourceDate, today) !== "active"
    )
      continue
    for (const sourceSlot of version.config.times.length
      ? version.config.times.map((t) => `time:${t}`)
      : ["all-day"]) {
      const override = edits.find(
        (edit) =>
          edit.scope === "this" &&
          edit.versionId === version.id &&
          edit.sourceDate === sourceDate &&
          edit.sourceSlot === sourceSlot
      )
      const rule = edits.find(
        (edit) =>
          edit.scope === "following" &&
          edit.versionId === version.id &&
          edit.sourceSlot === sourceSlot &&
          edit.sourceDate <= sourceDate
      )
      if (override?.canceled) continue
      const date =
        override?.date ??
        (rule
          ? addDays(sourceDate, dayDistance(rule.sourceDate, rule.date))
          : sourceDate)
      const time = override
        ? override.time
        : rule
          ? rule.time
          : sourceSlot === "all-day"
            ? null
            : sourceSlot.slice(5)
      add(
        version.id,
        sourceDate,
        sourceSlot,
        date,
        time,
        override?.minutes ?? rule?.minutes ?? version.config.defaultDuration
      )
    }
  }
  for (const extra of edits.filter((edit) => edit.scope === "extra")) {
    const override = edits.find(
      (edit) =>
        edit.scope === "this" &&
        edit.sourceSlot === extra.sourceSlot &&
        edit.versionId === extra.versionId &&
        edit.sourceDate === extra.sourceDate
    )
    if (!override?.canceled)
      add(
        extra.versionId,
        extra.sourceDate,
        extra.sourceSlot,
        override?.date ?? extra.date,
        override ? override.time : extra.time,
        override?.minutes ?? extra.minutes
      )
  }
  return result.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.sourceDate.localeCompare(b.sourceDate) || a.sourceSlot.localeCompare(b.sourceSlot)
  )
}
export function calendarBlocks(habit: Habit, from: string, to: string, today: string, timezone: string): HabitCalendarBlock[] {
  return plannedHabitSlots(habit, from, to, today).map((slot) => {
    const progress = progressOn(habit, slot.date)!, start = slot.time ? wallTime(slot.date, slot.time, timezone) : null
    return {
      ...slot, kind: "habit", id: `habit:${habit.id}:${slot.versionId}:${slot.sourceDate}:${slot.sourceSlot}`, habitId: habit.id, title: habit.name, icon: habit.icon, color: habitColors[habit.color],
      start: start?.toISOString() ?? slot.date, end: start ? new Date(start.getTime() + slot.minutes * 60000).toISOString() : null, allDay: !slot.time,
      amount: progress.amount, target: progress.target, goal: goalLabel(progress.version.config), recordedMinutes: recordedMinutes(habit, slot.date), complete: progress.complete, partial: progress.amount > 0 && !progress.complete, skipped: progress.skipped,
      editable: slot.date >= today && !progress.complete && !habit.logs.some(log => !log.deleted && log.date === slot.date),
    }
  }).sort((a,b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
}
export function flexibleTargets(
  habit: Habit,
  from: string,
  to: string,
  today: string
): FlexibleHabitTarget[] {
  const result: FlexibleHabitTarget[] = [],
    seen = new Set<string>()
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const version = versionOn(habit, date)
    if (
      !version ||
      version.config.schedule !== "flexible" ||
      !progressOn(habit, date) ||
      statusOn(habit, date, today) !== "active"
    )
      continue
    const week = weekDates(date, version.config.weekStart),
      key = `${version.id}:${week[0]}`
    if (seen.has(key)) continue
    seen.add(key)
    const progress = flexibleProgress(habit, date)!
    const planDate = [
      week[0],
      today,
      version.effectiveFrom,
      version.config.startDate,
    ]
      .sort()
      .at(-1)!
    result.push({
      habitId: habit.id,
      versionId: version.id,
      name: habit.name,
      icon: habit.icon,
      start: week[0],
      end: week[6],
      planDate:
        planDate <= week[6] &&
        (!version.config.endDate || planDate <= version.config.endDate)
          ? planDate
          : null,
      ...progress,
    })
  }
  return result
}
export const habitReminderActionSchema = z
  .object({
    id: z.uuid(),
    versionId: z.uuid(),
    date: dateSchema,
    time: timeSchema,
    action: z.enum(["dismiss", "snooze"]),
    minutes: z.union([z.literal(10), z.literal(30), z.literal(60)]).optional(),
  })
  .strict()
  .refine(
    (v) => v.action !== "snooze" || v.minutes !== undefined,
    "Choose a snooze duration"
  )
export type HabitReminderAction = z.infer<typeof habitReminderActionSchema>
export type HabitReminderState = {
  versionId: string
  date: string
  time: string
  dismissedAt: string | null
  snoozedUntil: string | null
}
export type DueHabitReminder = {
  kind: "habit"
  habitId: string
  versionId: string
  date: string
  time: string
  title: string
  icon: string
  fireAt: string
  notifyAt: string
}
export const habitReminderKey = (
  r: Pick<DueHabitReminder, "habitId" | "versionId" | "date" | "time">
) => `habit:${r.habitId}:${r.versionId}:${r.date}:${r.time}`
export function reminderCandidates(
  habit: Habit,
  from: string,
  to: string,
  today: string,
  timezone: string
): DueHabitReminder[] {
  const blocks = calendarBlocks(habit, from, to, today, timezone),
    result: DueHabitReminder[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const progress = progressOn(habit, date)
    if (
      !progress ||
      progress.complete ||
      progress.skipped ||
      statusOn(habit, date, today) !== "active" ||
      !blocks.some((block) => block.date === date)
    )
      continue
    for (const time of progress.version.config.reminders) {
      const fireAt = wallTime(date, time, timezone).toISOString()
      result.push({
        kind: "habit",
        habitId: habit.id,
        versionId: progress.version.id,
        date,
        time,
        title: habit.name,
        icon: habit.icon,
        fireAt,
        notifyAt: fireAt,
      })
    }
  }
  return result
}
export function dueHabitReminderRows(
  habit: Habit,
  states: HabitReminderState[],
  now: Date,
  timezone: string
) {
  const today = todayIn(timezone, now),
    lower = now.getTime() - 86400000
  return reminderCandidates(
    habit,
    addDays(today, -1),
    today,
    today,
    timezone
  ).flatMap((reminder) => {
    const state = states.find(
      (s) =>
        s.versionId === reminder.versionId &&
        s.date === reminder.date &&
        s.time === reminder.time
    )
    const notifyAt = state?.snoozedUntil ?? reminder.fireAt
    if (
      state?.dismissedAt ||
      Date.parse(reminder.fireAt) < lower ||
      Date.parse(notifyAt) > now.getTime()
    )
      return []
    return [{ ...reminder, notifyAt }]
  })
}
