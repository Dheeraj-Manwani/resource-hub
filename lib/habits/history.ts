import { z } from "zod"
import {
  addDays,
  dateSchema,
  goalPeriod,
  goalMinutes,
  goalUnit,
  isTimeGoal,
  monthBounds,
  statusOn,
  weekDates,
  type Habit,
  type HabitVersion,
} from "./model"
import { plannedHabitSlots } from "./planning"

export const historyViews = ["day", "week", "month", "quarter"] as const
export type HistoryView = (typeof historyViews)[number]
export const habitHistoryQuerySchema = z.object({
  date: dateSchema.optional(),
  view: z.enum(historyViews).default("quarter"),
  habitId: z.uuid().optional(),
})
export type HistoryState =
  "complete" | "partial" | "missed" | "skipped" | "rest" | "pending"
export const historyStateLabels: Record<HistoryState, string> = {
  complete: "Goal met",
  partial: "Saved effort",
  missed: "Goal not met",
  skipped: "Skipped",
  rest: "Rest or paused",
  pending: "Open goal",
}
export function historyBounds(
  date: string,
  view: HistoryView,
  weekStart: number
) {
  const week = weekDates(date, weekStart)
  return view === "day"
    ? { from: date, to: date }
    : view === "week"
      ? { from: week[0], to: week[6] }
      : view === "month"
        ? { from: monthBounds(date).start, to: monthBounds(date).end }
        : { from: addDays(week[0], -77), to: week[6] }
}
export function shiftHistoryDate(
  date: string,
  view: HistoryView,
  direction: -1 | 1
) {
  if (view !== "month")
    return addDays(
      date,
      direction * (view === "day" ? 1 : view === "week" ? 7 : 84)
    )
  const first = new Date(`${date.slice(0, 7)}-01T12:00Z`)
  first.setUTCMonth(first.getUTCMonth() + direction)
  const start = first.toISOString().slice(0, 10)
  return `${start.slice(0, 7)}-${String(Math.min(Number(date.slice(8)), Number(monthBounds(start).end.slice(8)))).padStart(2, "0")}`
}
export const roundWork = (n: number) => Math.round(n * 1000) / 1000
export function historyUnit(version: HabitVersion) {
  return goalUnit(version.config)
}
export type HistoryDay = {
  date: string
  state: HistoryState
  amount: number
  unit: string
  minutes: number
  plannedMinutes: number
  goalAmount: number
  goalTarget: number
  goalPeriod: "day" | "week" | "month"
  goalComplete: boolean
  periodStart: string
  periodEnd: string
  eligible: boolean
  flexible: boolean
}
export type HistoryPeriod = {
  key: string
  versionId: string
  start: string
  end: string
  type: "day" | "week" | "month" | "flexible"
  amount: number
  target: number
  timeTarget: number | null
  unit: string
  minutes: number
  complete: boolean
  closed: boolean
  eligible: boolean
  state: HistoryState
  firstWorkDate: string | null
}
export type HistoryWeek = {
  start: string
  end: string
  minutes: number
  target: number
  hasTarget: boolean
}
export type ConsistencyWeek = {
  start: string
  end: string
  completed: number
  eligible: number
  rate: number | null
}
export type HabitHistory = Pick<
  Habit,
  "id" | "name" | "icon" | "color" | "reason" | "status"
> & {
  days: HistoryDay[]
  periods: HistoryPeriod[]
  timeWeeks: HistoryWeek[]
  trend: ConsistencyWeek[]
  notes: { id: string; date: string; text: string; source: string }[]
  summary: {
    minutes: number
    workedDates: string[]
    completedDays: number
    completedGoals: number
    weeklyTargetsMet: number
    currentStreak: number
    bestStreak: number
    eligible: number
    completed: number
    rate: number | null
    totals: { unit: string; amount: number }[]
  }
  range: {
    minutes: number
    eligible: number
    completed: number
    rate: number | null
  }
}
type IndexedDay = { minutes: number; amount: number; hasWork: boolean }
type PeriodWork = {
  amount: number
  skipped: boolean
  minutes: number
  firstWorkDate: string | null
}
type WorkingPeriod = HistoryPeriod & {
  dueDays: number
  inactive: boolean
  skipped: boolean
  skipDays: number
}
const periodKey = (id: string, start: string, end: string) =>
  `${id}:${start}:${end}`
const rateOf = (completed: number, eligible: number) =>
  eligible ? Math.round((completed / eligible) * 100) : null

/** All charts share the same saved-log index. Plans contribute due dates only. */
export function analyseHabitHistory(
  habit: Habit,
  from: string,
  to: string,
  today: string,
  weekStart: number
): HabitHistory {
  const versions = [
    ...new Map(
      [...habit.versions]
        .sort(
          (a, b) =>
            a.effectiveFrom.localeCompare(b.effectiveFrom) ||
            a.revision - b.revision
        )
        .map((v) => [v.effectiveFrom, v])
    ).values(),
  ]
  const byVersion = new Map(habit.versions.map((v) => [v.id, v]))
  const byDay = new Map<string, IndexedDay>(),
    workByPeriod = new Map<string, PeriodWork>(),
    totals = new Map<string, number>()
  const logs = habit.logs.filter((l) => !l.deleted)
  for (const log of logs) {
    const version = byVersion.get(log.versionId)
    if (!version) continue
    const minutes =
      log.source === "timer"
        ? (log.elapsedMs ?? 0) / 60000
        : log.kind === "progress"
          ? goalMinutes(version.config, log.amount)
          : 0
    const amount = log.kind === "progress" ? log.amount : 0,
      hasWork = amount > 0 || minutes > 0
    const day = byDay.get(log.date) ?? { minutes: 0, amount: 0, hasWork: false }
    day.minutes += minutes
    day.amount += amount
    day.hasWork ||= hasWork
    byDay.set(log.date, day)
    const key = periodKey(log.versionId, log.periodStart, log.periodEnd),
      work = workByPeriod.get(key) ?? {
        amount: 0,
        skipped: false,
        minutes: 0,
        firstWorkDate: null,
      }
    work.amount += amount
    work.minutes += minutes
    work.skipped ||= log.kind === "skip"
    if (hasWork && (!work.firstWorkDate || log.date < work.firstWorkDate))
      work.firstWorkDate = log.date
    workByPeriod.set(key, work)
    if (amount && !isTimeGoal(version.config))
      totals.set(
        historyUnit(version),
        (totals.get(historyUnit(version)) ?? 0) + amount
      )
  }
  const earliest =
    versions
      .map((v) => [v.effectiveFrom, v.config.startDate].sort().at(-1)!)
      .sort()[0] ?? today
  const trendEnd = to < today ? to : addDays(today, -1),
    trendStart = addDays(weekDates(trendEnd, weekStart)[0], -77)
  const scanFrom = [earliest, from, trendStart].sort()[0],
    scanTo = [today, to, ...byDay.keys()].sort().at(-1)!
  const planned = new Map<string, number>(),
    rawDates = new Set<string>()
  for (const slot of plannedHabitSlots(habit, scanFrom, scanTo, today))
    planned.set(slot.date, (planned.get(slot.date) ?? 0) + slot.minutes)
  // A completion recorded before pausing/archiving still belongs to its plan.
  for (const slot of plannedHabitSlots(
    { ...habit, status: "active", states: [] },
    scanFrom,
    scanTo,
    today
  ))
    rawDates.add(slot.date)
  const periods = new Map<string, WorkingPeriod>(),
    days: HistoryDay[] = []
  let versionIndex = -1
  for (let date = scanFrom; date <= scanTo; date = addDays(date, 1)) {
    while (
      versionIndex + 1 < versions.length &&
      versions[versionIndex + 1].effectiveFrom <= date
    )
      versionIndex++
    const version = versions[versionIndex],
      day = byDay.get(date) ?? { minutes: 0, amount: 0, hasWork: false }
    if (
      !version ||
      date < version.config.startDate ||
      (version.config.endDate && date > version.config.endDate)
    ) {
      if (date >= from && date <= to)
        days.push({
          date,
          state: day.hasWork ? "partial" : "rest",
          amount: roundWork(day.amount),
          unit: "",
          minutes: roundWork(day.minutes),
          plannedMinutes: 0,
          goalAmount: 0,
          goalTarget: 0,
          goalPeriod: "day",
          goalComplete: false,
          periodStart: date,
          periodEnd: date,
          eligible: false,
          flexible: false,
        })
      continue
    }
    const config = version.config,
      daily = goalPeriod(config, date, version.effectiveFrom),
      dailyKey = periodKey(version.id, daily.start, daily.end)
    const dailyWork = workByPeriod.get(dailyKey),
      dailyComplete = roundWork(dailyWork?.amount ?? 0) >= config.target
    const flexible = config.schedule === "flexible",
      active = statusOn(habit, date, today) === "active"
    const week = weekDates(date, config.weekStart)
    const bounds = flexible
      ? {
          start: [week[0], version.effectiveFrom, config.startDate]
            .sort()
            .at(-1)!,
          end: [
            week[6],
            config.endDate ?? week[6],
            versions[versionIndex + 1]
              ? addDays(versions[versionIndex + 1].effectiveFrom, -1)
              : week[6],
          ].sort()[0],
        }
      : daily
    const key = periodKey(version.id, bounds.start, bounds.end)
    let period = periods.get(key)
    if (!period) {
      const work = flexible ? undefined : workByPeriod.get(key)
      period = {
        key,
        versionId: version.id,
        start: bounds.start,
        end: bounds.end,
        type: flexible ? "flexible" : config.goalPeriod,
        amount: work?.amount ?? 0,
        target: flexible ? config.weeklyDays : config.target,
        timeTarget: isTimeGoal(config)
          ? goalMinutes(config, config.target) *
            (flexible ? config.weeklyDays : 1)
          : null,
        unit: flexible ? "completed days" : historyUnit(version),
        minutes: work?.minutes ?? 0,
        complete: false,
        closed: bounds.end < today,
        eligible: false,
        state: "rest",
        firstWorkDate: work?.firstWorkDate ?? null,
        dueDays: 0,
        inactive: false,
        skipped: work?.skipped ?? false,
        skipDays: 0,
      }
      periods.set(key, period)
    }
    const due = flexible
      ? active || (dailyComplete && !!dailyWork?.firstWorkDate)
      : planned.has(date) ||
        (dailyComplete && !!dailyWork?.firstWorkDate && rawDates.has(date))
    if (due) period.dueDays++
    if (!active && (flexible || rawDates.has(date))) period.inactive = true
    if (flexible) {
      if (dailyComplete) period.amount++
      period.minutes += day.minutes
      if (day.hasWork && !period.firstWorkDate) period.firstWorkDate = date
      if (dailyWork?.skipped && !dailyWork.amount) period.skipDays++
    }
    const skipped = !!dailyWork?.skipped && !(dailyWork.amount > 0),
      isDaily = config.goalPeriod === "day"
    const state: HistoryState =
      isDaily && dailyComplete
        ? "complete"
        : skipped
          ? "skipped"
          : day.hasWork
            ? "partial"
            : !(flexible ? planned.has(date) : due)
              ? "rest"
              : date < today && isDaily && (!flexible || planned.has(date))
                ? "missed"
                : date < today && !isDaily
                  ? "rest"
                  : "pending"
    if (date >= from && date <= to)
      days.push({
        date,
        state,
        amount: roundWork(day.amount),
        unit: historyUnit(version),
        minutes: roundWork(day.minutes),
        plannedMinutes: planned.get(date) ?? 0,
        goalAmount: roundWork(dailyWork?.amount ?? 0),
        goalTarget: config.target,
        goalPeriod: config.goalPeriod,
        goalComplete: dailyComplete,
        periodStart: daily.start,
        periodEnd: daily.end,
        eligible: due,
        flexible,
      })
  }
  const allPeriods = [...periods.values()].sort(
    (a, b) => a.end.localeCompare(b.end) || a.start.localeCompare(b.start)
  )
  let currentStreak = 0,
    bestStreak = 0
  for (const period of allPeriods) {
    period.amount = roundWork(period.amount)
    period.minutes = roundWork(period.minutes)
    period.complete = period.amount >= period.target
    const skipped =
      (period.skipped ||
        (period.type === "flexible" &&
          period.dueDays > 0 &&
          period.skipDays >= period.dueDays)) &&
      period.amount === 0
    period.eligible =
      period.dueDays > 0 &&
      !skipped &&
      (!period.inactive || period.complete) &&
      (period.type !== "flexible" ||
        period.dueDays >= period.target ||
        period.complete)
    period.state = period.complete
      ? "complete"
      : skipped
        ? "skipped"
        : period.amount > 0 || period.minutes > 0
          ? "partial"
          : period.eligible
            ? period.closed
              ? "missed"
              : "pending"
            : "rest"
    if (period.eligible && period.start <= today) {
      if (period.complete) {
        currentStreak++
        bestStreak = Math.max(bestStreak, currentStreak)
      } else if (period.closed) currentStreak = 0
    }
  }
  const closed = allPeriods.filter((p) => p.closed && p.eligible),
    completed = closed.filter((p) => p.complete).length
  const rangePeriods = allPeriods.filter((p) => p.start <= to && p.end >= from)
  const rangeClosed = closed.filter((p) => p.end >= from && p.end <= to),
    rangeCompleted = rangeClosed.filter((p) => p.complete).length
  for (const day of days) {
    if (
      day.goalPeriod === "day" ||
      day.amount > 0 ||
      day.minutes > 0 ||
      day.state === "skipped"
    )
      continue
    const period = allPeriods.find(
      (p) => p.start === day.periodStart && p.end === day.periodEnd
    )
    if (
      period?.closed &&
      period.eligible &&
      !period.complete &&
      day.date === period.end
    )
      day.state = "missed"
  }
  const timeWeeks: HistoryWeek[] = []
  for (
    let start = weekDates(from, weekStart)[0];
    start <= to;
    start = addDays(start, 7)
  ) {
    const end = addDays(start, 6),
      visible = days.filter((d) => d.date >= start && d.date <= end)
    const dailyTargets = rangePeriods
      .filter(
        (p) =>
          p.type === "day" &&
          p.timeTarget !== null &&
          p.eligible &&
          p.start >= start &&
          p.end <= end
      )
      .reduce((sum, p) => sum + p.timeTarget!, 0)
    const weeklyTargets = rangePeriods
      .filter(
        (p) =>
          (p.type === "week" || p.type === "flexible") &&
          p.timeTarget !== null &&
          p.eligible &&
          p.start >= from &&
          p.end <= to &&
          p.end >= start &&
          p.end <= end
      )
      .reduce((sum, p) => sum + p.timeTarget!, 0)
    timeWeeks.push({
      start,
      end,
      minutes: roundWork(visible.reduce((sum, d) => sum + d.minutes, 0)),
      target: roundWork(dailyTargets + weeklyTargets),
      hasTarget: dailyTargets + weeklyTargets > 0,
    })
  }
  const trend: ConsistencyWeek[] = []
  for (let start = trendStart; start <= trendEnd; start = addDays(start, 7)) {
    const end = addDays(start, 6),
      eligible = closed.filter(
        (p) => p.end >= start && p.end <= end && p.end <= trendEnd
      ),
      done = eligible.filter((p) => p.complete).length
    trend.push({
      start,
      end,
      completed: done,
      eligible: eligible.length,
      rate: rateOf(done, eligible.length),
    })
  }
  const notes: HabitHistory["notes"] = [],
    seenNotes = new Set<string>()
  for (const log of [...logs].sort((a, b) => b.date.localeCompare(a.date))) {
    if (!log.notes || log.date < from || log.date > to) continue
    const key = log.sessionId ?? log.id
    if (seenNotes.has(key)) continue
    seenNotes.add(key)
    notes.push({
      id: log.id,
      date: log.date,
      text: log.notes,
      source: log.source ?? "manual",
    })
    if (notes.length === 6) break
  }
  return {
    id: habit.id,
    name: habit.name,
    icon: habit.icon,
    color: habit.color,
    reason: habit.reason,
    status: habit.status,
    days,
    periods: rangePeriods
      .filter((p) => p.type !== "day" && (p.dueDays > 0 || p.firstWorkDate))
      .map((p): HistoryPeriod => ({
        key: p.key,
        versionId: p.versionId,
        start: p.start,
        end: p.end,
        type: p.type,
        amount: p.amount,
        target: p.target,
        timeTarget: p.timeTarget,
        unit: p.unit,
        minutes: p.minutes,
        complete: p.complete,
        closed: p.closed,
        eligible: p.eligible,
        state: p.state,
        firstWorkDate: p.firstWorkDate,
      })),
    timeWeeks,
    trend,
    notes,
    summary: {
      minutes: roundWork(
        [...byDay.values()].reduce((sum, d) => sum + d.minutes, 0)
      ),
      workedDates: [...byDay]
        .filter(([, d]) => d.hasWork)
        .map(([date]) => date)
        .sort(),
      completedDays:
        allPeriods.filter((p) => p.type === "day" && p.complete).length +
        allPeriods
          .filter((p) => p.type === "flexible")
          .reduce((sum, p) => sum + p.amount, 0),
      completedGoals: allPeriods.reduce(
        (sum, p) =>
          sum + (p.type === "flexible" ? p.amount : Number(p.complete)),
        0
      ),
      weeklyTargetsMet: allPeriods.filter(
        (p) => p.type === "flexible" && p.complete
      ).length,
      currentStreak,
      bestStreak,
      eligible: closed.length,
      completed,
      rate: rateOf(completed, closed.length),
      totals: [...totals].map(([unit, amount]) => ({
        unit,
        amount: roundWork(amount),
      })),
    },
    range: {
      minutes: roundWork(days.reduce((sum, d) => sum + d.minutes, 0)),
      eligible: rangeClosed.length,
      completed: rangeCompleted,
      rate: rateOf(rangeCompleted, rangeClosed.length),
    },
  }
}
