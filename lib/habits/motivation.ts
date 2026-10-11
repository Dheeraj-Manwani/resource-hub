import { z } from "zod"
import { analyseHabitHistory, roundWork } from "./history"
import { addDays, weekDates, versionOn, type Habit } from "./model"

export const motivationDefaults = {
  quiet: false,
  celebrations: true,
  sound: false,
  nudges: true,
  recaps: true,
}
export type MotivationPreferences = typeof motivationDefaults
export const motivationPreferencesSchema = z
  .object({
    quiet: z.boolean().optional(),
    celebrations: z.boolean().optional(),
    sound: z.boolean().optional(),
    nudges: z.boolean().optional(),
    recaps: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Choose a preference")

type Metric =
  "effortDays" | "minutes" | "goals" | "weeklyGoals" | "monthlyGoals"
export type Milestone = {
  id: string
  title: string
  description: string
  metric: Metric
  target: number
  value: number
  earned: boolean
}
const definitions: Omit<Milestone, "value" | "earned">[] = [
  {
    id: "first-effort",
    title: "A beginning",
    description: "Your first day with saved effort",
    metric: "effortDays",
    target: 1,
  },
  ...[60, 300, 1500, 6000].map((target) => ({
    id: `time-${target}`,
    title: `${target / 60} ${target === 60 ? "hour" : "hours"} invested`,
    description: "Actual working time, including partial sessions",
    metric: "minutes" as const,
    target,
  })),
  ...[5, 20, 50, 100].map((target) => ({
    id: `goals-${target}`,
    title: `${target} goals kept`,
    description: "Completed scheduled goals; each period counts once",
    metric: "goals" as const,
    target,
  })),
  ...[1, 10].map((target) => ({
    id: `weeks-${target}`,
    title: target === 1 ? "A week fulfilled" : "10 weeks fulfilled",
    description: "Completed weekly goals or flexible weekly targets",
    metric: "weeklyGoals" as const,
    target,
  })),
  {
    id: "first-month",
    title: "A month fulfilled",
    description: "Your first completed monthly goal",
    metric: "monthlyGoals",
    target: 1,
  },
]
function logMinutes(habit: Habit, log: Habit["logs"][number]) {
  if (log.deleted) return 0
  return log.source === "timer"
    ? (log.elapsedMs ?? 0) / 60000
    : log.kind === "progress" &&
        habit.versions.find((v) => v.id === log.versionId)?.config.goalType ===
          "minutes"
      ? log.amount
      : 0
}
function hasWork(habit: Habit, log: Habit["logs"][number]) {
  return (
    !log.deleted &&
    ((log.kind === "progress" && log.amount > 0) || logMinutes(habit, log) > 0)
  )
}
export function summariseHabitWork(habits: Habit[], from: string, to: string) {
  const dates = new Set<string>(),
    ids = new Set<string>()
  let minutes = 0
  for (const habit of habits)
    for (const log of habit.logs) {
      if (log.date < from || log.date > to || !hasWork(habit, log)) continue
      dates.add(log.date)
      ids.add(habit.id)
      minutes += logMinutes(habit, log)
    }
  return {
    from,
    to,
    days: dates.size,
    habits: ids.size,
    minutes: roundWork(minutes),
  }
}
export function habitJourney(habit: Habit, today: string, weekStart: number) {
  const from = habit.versions.map((v) => v.effectiveFrom).sort()[0] ?? today
  const history = analyseHabitHistory(habit, from, today, today, weekStart)
  const dailyGoals = history.days.filter(
    (d) => d.eligible && d.goalPeriod === "day" && d.goalComplete
  ).length
  const periods = history.periods.filter((p) => p.eligible && p.complete)
  const metrics = {
    effortDays: history.summary.workedDates.length,
    minutes: history.summary.minutes,
    goals: dailyGoals + periods.filter((p) => p.type !== "flexible").length,
    weeklyGoals: periods.filter(
      (p) => p.type === "week" || p.type === "flexible"
    ).length,
    monthlyGoals: periods.filter((p) => p.type === "month").length,
  }
  const badges = definitions.map((d) => ({
    ...d,
    value: metrics[d.metric],
    earned: metrics[d.metric] >= d.target,
  }))
  const next = (
    [
      "effortDays",
      "minutes",
      "goals",
      "weeklyGoals",
      "monthlyGoals",
    ] as Metric[]
  )
    .map((metric) => badges.find((b) => b.metric === metric && !b.earned))
    .filter((b): b is Milestone => !!b)
  const lastWorkDate = history.summary.workedDates.at(-1) ?? null
  const todayWork = history.summary.workedDates.includes(today)
  const gap = lastWorkDate && lastWorkDate <= addDays(today, -7)
  const current = versionOn(habit, today)
  const available =
    !!current &&
    today >= current.config.startDate &&
    (!current.config.endDate || today <= current.config.endDate)
  const nudge =
    habit.status !== "active" || !available || todayWork
      ? null
      : gap
        ? "Welcome back whenever you're ready. Your earlier work is still here."
        : habit.reason ||
          (current?.config.goalType === "minutes"
            ? "Five minutes is a place to start. Choose a time that fits today."
            : "One small step is a place to start. Choose what fits today.")
  const week = weekDates(today, weekStart),
    previous = weekDates(addDays(week[0], -1), weekStart)
  function recap(start: string, end: string) {
    const logs = habit.logs.filter(
      (l) => l.date >= start && l.date <= end && hasWork(habit, l)
    )
    return {
      from: start,
      to: end,
      days: new Set(logs.map((l) => l.date)).size,
      minutes: roundWork(
        logs.reduce((sum, l) => sum + logMinutes(habit, l), 0)
      ),
    }
  }
  return {
    id: habit.id,
    name: habit.name,
    icon: habit.icon,
    status: habit.status,
    goalPeriod: current?.config.goalPeriod,
    flexible: current?.config.schedule === "flexible",
    metrics,
    badges,
    next,
    lastWorkDate,
    nudge,
    today: recap(today, today),
    week: recap(week[0], today),
    previousWeek: recap(previous[0], previous[6]),
  }
}
export type HabitJourney = ReturnType<typeof habitJourney>
export type HabitReward = { milestones: Milestone[]; returning: boolean }
export function rewardCandidates(
  before: HabitJourney,
  after: HabitJourney,
  today: string
): HabitReward {
  const earnedBefore = new Set(
    before.badges.filter((b) => b.earned).map((b) => b.id)
  )
  return {
    milestones: after.badges.filter((b) => b.earned && !earnedBefore.has(b.id)),
    returning:
      !!before.lastWorkDate &&
      before.lastWorkDate <= addDays(today, -7) &&
      !before.today.days &&
      after.today.days > 0,
  }
}

export type HabitRewardEvent = HabitReward & {
  name: string
  completed: boolean
}
export function announceHabitReward(event: HabitRewardEvent) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("habit-reward", { detail: event }))
}
