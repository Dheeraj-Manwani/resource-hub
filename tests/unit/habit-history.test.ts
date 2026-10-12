import { describe, expect, it } from "vitest"
import {
  analyseHabitHistory,
  historyBounds,
  shiftHistoryDate,
} from "@/lib/habits/history"
import {
  defaultConfig,
  goalPeriod,
  versionOn,
  type Habit,
  type HabitConfig,
  type HabitLog,
} from "@/lib/habits/model"
import type { HabitPlanEdit } from "@/lib/habits/planning"
import { recordedMinutes } from "@/lib/habits/planning"
import { habitsCsv } from "@/lib/habits/csv"
import { habitJourney } from "@/lib/habits/motivation"

function habit(config: Partial<HabitConfig> = {}): Habit {
  return {
    id: "habit",
    name: "Read",
    reason: "For myself",
    icon: "📖",
    color: "orange",
    status: "active",
    revision: 1,
    versions: [
      {
        id: "v1",
        revision: 1,
        effectiveFrom: "2026-10-05",
        config: { ...defaultConfig("2026-10-05", 1), ...config },
      },
    ],
    logs: [],
    states: [{ status: "active", date: "2026-10-05" }],
    plans: [],
  }
}
function log(
  h: Habit,
  date: string,
  amount: number,
  patch: Partial<HabitLog> = {}
): HabitLog {
  const v = versionOn(h, date)!,
    p = goalPeriod(v.config, date, v.effectiveFrom)
  return {
    id: crypto.randomUUID(),
    versionId: v.id,
    date,
    periodStart: p.start,
    periodEnd: p.end,
    kind: "progress",
    amount,
    notes: "",
    deleted: false,
    revision: 1,
    ...patch,
  }
}
function analyse(
  h: Habit,
  today = "2026-10-12",
  from = "2026-10-05",
  to = "2026-10-11"
) {
  return analyseHabitHistory(h, from, to, today, 1)
}
function plan(patch: Partial<HabitPlanEdit> = {}): HabitPlanEdit {
  return {
    id: "plan",
    revision: 2,
    versionId: "v1",
    scope: "this",
    sourceDate: "2026-10-05",
    sourceSlot: "all-day",
    date: "2026-10-06",
    time: null,
    minutes: 30,
    canceled: false,
    ...patch,
  }
}

describe("history range navigation", () => {
  it("uses civil dates, week preferences and an exact twelve-week window", () => {
    expect(historyBounds("2026-03-08", "week", 0)).toEqual({
      from: "2026-03-08",
      to: "2026-03-14",
    })
    const q = historyBounds("2026-03-08", "quarter", 1)
    expect((Date.parse(q.to) - Date.parse(q.from)) / 86400000 + 1).toBe(84)
    expect(historyBounds("2024-02-29", "month", 1).to).toBe("2024-02-29")
  })
  it("keeps month navigation valid for short months and leap years", () => {
    expect(shiftHistoryDate("2026-01-31", "month", 1)).toBe("2026-02-28")
    expect(shiftHistoryDate("2024-03-31", "month", -1)).toBe("2024-02-29")
    expect(shiftHistoryDate("2026-03-08", "day", 1)).toBe("2026-03-09")
  })
})
describe("saved effort and schedule-aware consistency", () => {
  it("preserves minute records when a later goal changes to hours", () => {
    const h = habit({ target: 120, schedule: "weekdays", weekdays: [1, 3] })
    h.versions.push({
      id: "v2",
      revision: 2,
      effectiveFrom: "2026-10-07",
      config: {
        ...h.versions[0].config,
        goalType: "hours",
        target: 2,
        unit: "hours",
      },
    })
    h.logs = [log(h, "2026-10-05", 90), log(h, "2026-10-07", 1.5)]
    const a = analyse(h)
    expect(a.days[0]).toMatchObject({
      amount: 90,
      unit: "minutes",
      minutes: 90,
    })
    expect(a.days[2]).toMatchObject({ amount: 1.5, unit: "hours", minutes: 90 })
    expect(a.summary.minutes).toBe(180)
    expect(a.timeWeeks[0].target).toBe(240)
  })
  it("counts hour goals in their own unit while aggregating manual and timer work in minutes", () => {
    const h = habit({
      goalType: "hours",
      unit: "hours",
      target: 4,
      schedule: "weekdays",
      weekdays: [1],
    })
    h.logs = [
      log(h, "2026-10-05", 1.5),
      log(h, "2026-10-05", 2.5, { source: "timer", elapsedMs: 9000000 }),
    ]
    const a = analyse(h)
    expect(a.days[0]).toMatchObject({
      amount: 4,
      unit: "hours",
      minutes: 240,
      state: "complete",
    })
    expect(a.summary).toMatchObject({ minutes: 240, completedGoals: 1 })
    expect(a.timeWeeks[0]).toMatchObject({ minutes: 240, target: 240 })
    expect(recordedMinutes(h, "2026-10-05")).toBe(240)
    expect(habitJourney(h, "2026-10-12", 1).metrics.minutes).toBe(240)
    expect(habitsCsv([h])).toContain('"progress","1.5","hours"')
    expect(habitsCsv([h])).toContain('"manual","90"')
    expect(habitsCsv([h])).toContain('"timer","150"')
  })
  it("does not count a preferred time, extra plan or calendar read as work", () => {
    const h = habit({ times: ["09:00", "19:00"] }),
      before = JSON.stringify(h),
      a = analyse(h)
    expect(a.summary.minutes).toBe(0)
    expect(a.summary.completedGoals).toBe(0)
    expect(a.range.eligible).toBe(7)
    expect(a.timeWeeks[0].target).toBe(210)
    expect(JSON.stringify(h)).toBe(before)
  })
  it("counts partial effort, rests and skips correctly without penalising unscheduled days", () => {
    const h = habit({ schedule: "weekdays", weekdays: [1, 3, 5] })
    h.logs = [
      log(h, "2026-10-05", 30),
      log(h, "2026-10-07", 18),
      log(h, "2026-10-09", 0, { kind: "skip" }),
    ]
    const a = analyse(h)
    expect(a.days.map((d) => d.state)).toEqual([
      "complete",
      "rest",
      "partial",
      "rest",
      "skipped",
      "rest",
      "rest",
    ])
    expect(a.summary).toMatchObject({
      minutes: 48,
      eligible: 2,
      completed: 1,
      rate: 50,
      currentStreak: 0,
      bestStreak: 1,
    })
  })
  it("keeps rest days and skips neutral in a streak", () => {
    const h = habit({ schedule: "weekdays", weekdays: [1, 3, 5] })
    h.logs = [
      log(h, "2026-10-05", 30),
      log(h, "2026-10-07", 0, { kind: "skip" }),
      log(h, "2026-10-09", 30),
    ]
    expect(analyse(h).summary).toMatchObject({
      currentStreak: 2,
      bestStreak: 2,
      rate: 100,
    })
  })
  it("leaves an incomplete current goal open until its civil day ends", () => {
    const h = habit({ startDate: "2026-10-10" })
    h.versions[0].effectiveFrom = "2026-10-10"
    h.logs = [log(h, "2026-10-10", 30), log(h, "2026-10-11", 18)]
    expect(analyse(h, "2026-10-11").summary).toMatchObject({
      eligible: 1,
      completed: 1,
      currentStreak: 1,
    })
    expect(analyse(h, "2026-10-12").summary).toMatchObject({
      eligible: 2,
      completed: 1,
      currentStreak: 0,
    })
  })
  it("counts weekly and monthly completion once and shows daily work only on its own day", () => {
    for (const goalPeriod of ["week", "month"] as const) {
      const h = habit({ goalPeriod, target: 60 })
      h.logs = [log(h, "2026-10-05", 30), log(h, "2026-10-07", 30)]
      const a = analyse(h)
      expect(a.summary.completedGoals).toBe(1)
      expect(a.summary.minutes).toBe(60)
      expect(a.summary.completedDays).toBe(0)
      expect(
        a.days.filter((d) => d.state === "partial").map((d) => d.date)
      ).toEqual(["2026-10-05", "2026-10-07"])
      expect(a.days.some((d) => d.state === "complete")).toBe(false)
      expect(a.summary.eligible).toBe(goalPeriod === "week" ? 1 : 0)
      expect(a.timeWeeks[0].target).toBe(goalPeriod === "week" ? 60 : 0)
    }
  })
  it("marks a closed unsuccessful period at its end and excludes ongoing periods from rates", () => {
    const h = habit({ goalPeriod: "week", target: 60 })
    h.logs = [log(h, "2026-10-05", 18)]
    const closed = analyse(h)
    expect(closed.periods[0]).toMatchObject({
      state: "partial",
      eligible: true,
      closed: true,
    })
    expect(closed.days.at(-1)?.state).toBe("missed")
    expect(closed.summary.rate).toBe(0)
    expect(analyse(h, "2026-10-11").summary.rate).toBeNull()
  })
  it("ignores deleted entries and recalculates after a correction or undo", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-05", 30), log(h, "2026-10-06", 30)]
    expect(analyse(h).summary.completedGoals).toBe(2)
    h.logs[0].amount = 18
    h.logs[1].deleted = true
    expect(analyse(h).summary).toMatchObject({
      minutes: 18,
      completedGoals: 0,
      bestStreak: 0,
    })
    h.logs[1].deleted = false
    expect(analyse(h).summary).toMatchObject({
      minutes: 48,
      completedGoals: 1,
      bestStreak: 1,
    })
  })
  it("adds timer work once and never turns a quantity session into quantity progress", () => {
    const h = habit({ goalType: "quantity", unit: "pages", target: 10 })
    h.logs = [
      log(h, "2026-10-05", 5),
      log(h, "2026-10-05", 0, {
        kind: "session",
        source: "timer",
        elapsedMs: 120000,
      }),
    ]
    const a = analyse(h)
    expect(a.summary).toMatchObject({
      minutes: 2,
      completedGoals: 0,
      totals: [{ unit: "pages", amount: 5 }],
    })
    expect(a.days[0]).toMatchObject({ state: "partial", amount: 5, minutes: 2 })
    expect(a.timeWeeks[0].target).toBe(0)
    const timed = habit()
    timed.logs = [
      log(timed, "2026-10-05", 18, { source: "timer", elapsedMs: 1080000 }),
      log(timed, "2026-10-05", 12),
    ]
    expect(analyse(timed).summary.minutes).toBe(30)
  })
  it("does not treat a quantity named minutes as a time target", () => {
    const h = habit({ goalType: "quantity", unit: "minutes", target: 10 })
    h.logs = [log(h, "2026-10-05", 5)]
    expect(analyse(h).summary.minutes).toBe(0)
    expect(analyse(h).timeWeeks[0].target).toBe(0)
  })
  it("retains units and targets across goal changes instead of merging different quantities", () => {
    const h = habit({ goalType: "quantity", target: 10, unit: "pages" })
    h.logs = [log(h, "2026-10-05", 10)]
    h.versions.push({
      id: "v2",
      revision: 2,
      effectiveFrom: "2026-10-06",
      config: { ...h.versions[0].config, unit: "reps", target: 20 },
    })
    h.logs.push(log(h, "2026-10-06", 20))
    const a = analyse(h)
    expect(a.days[0]).toMatchObject({
      unit: "pages",
      goalTarget: 10,
      state: "complete",
    })
    expect(a.days[1]).toMatchObject({
      unit: "reps",
      goalTarget: 20,
      state: "complete",
    })
    expect(a.summary.totals).toEqual([
      { unit: "pages", amount: 10 },
      { unit: "reps", amount: 20 },
    ])
  })
  it("preserves archived work and makes paused periods neutral", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-05", 30)]
    h.status = "archived"
    h.states.push({ status: "archived", date: "2026-10-06" })
    expect(analyse(h).summary).toMatchObject({
      minutes: 30,
      currentStreak: 1,
      eligible: 1,
      completed: 1,
    })
    const weekly = habit({ goalPeriod: "week", target: 60 })
    weekly.logs = [log(weekly, "2026-10-05", 18)]
    weekly.status = "paused"
    weekly.states.push({ status: "paused", date: "2026-10-06" })
    expect(analyse(weekly).summary.eligible).toBe(0)
    expect(analyse(weekly).periods[0]).toMatchObject({
      minutes: 18,
      state: "partial",
      eligible: false,
    })
  })
  it("preserves a completion saved on the same day as archiving", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-05", 30)]
    h.status = "archived"
    h.states.push({ status: "archived", date: "2026-10-05" })
    expect(analyse(h).summary).toMatchObject({
      completedGoals: 1,
      eligible: 1,
      completed: 1,
      currentStreak: 1,
    })
  })
  it("follows moved/canceled dates and deduplicates multiple prompts for one daily goal", () => {
    const h = habit({ schedule: "weekdays", weekdays: [1] })
    h.plans = [plan()]
    h.logs = [log(h, "2026-10-06", 30)]
    const a = analyse(h)
    expect(a.days[0].state).toBe("rest")
    expect(a.summary).toMatchObject({
      eligible: 1,
      completed: 1,
      currentStreak: 1,
    })
    h.logs = []
    h.plans = [plan({ canceled: true })]
    expect(analyse(h).summary.eligible).toBe(0)
  })
  it("keeps unscheduled extra work visible without inflating consistency", () => {
    const h = habit({ schedule: "weekdays", weekdays: [1] })
    h.logs = [log(h, "2026-10-06", 30)]
    expect(analyse(h).summary).toMatchObject({
      minutes: 30,
      completedGoals: 1,
      eligible: 1,
      completed: 0,
      rate: 0,
      currentStreak: 0,
    })
  })
  it("counts flexible weekly targets by completed days, never sessions or skipped dates", () => {
    const h = habit({ schedule: "flexible", weeklyDays: 2 })
    h.logs = [
      log(h, "2026-10-05", 18),
      log(h, "2026-10-05", 12),
      log(h, "2026-10-07", 30),
      log(h, "2026-10-09", 0, { kind: "skip" }),
    ]
    const a = analyse(h)
    expect(a.summary).toMatchObject({
      minutes: 60,
      completedDays: 2,
      completedGoals: 2,
      weeklyTargetsMet: 1,
      eligible: 1,
      completed: 1,
      currentStreak: 1,
    })
    expect(a.periods[0]).toMatchObject({
      type: "flexible",
      amount: 2,
      target: 2,
      complete: true,
    })
    expect(a.days[1].state).toBe("rest")
    expect(a.timeWeeks[0].target).toBe(60)
  })
  it("keeps flexible short weeks and weeks with every day skipped neutral", () => {
    const h = habit({
      schedule: "flexible",
      weeklyDays: 3,
      startDate: "2026-10-11",
    })
    h.versions[0].effectiveFrom = "2026-10-11"
    expect(analyse(h).summary.eligible).toBe(0)
    const skipped = habit({ schedule: "flexible", weeklyDays: 3 })
    for (let d = 5; d <= 11; d++)
      skipped.logs.push(
        log(skipped, `2026-10-${String(d).padStart(2, "0")}`, 0, {
          kind: "skip",
        })
      )
    expect(analyse(skipped).summary).toMatchObject({
      eligible: 0,
      completedGoals: 0,
      currentStreak: 0,
    })
  })
  it("does not move older flexible results when the weekly target changes midweek", () => {
    const h = habit({ schedule: "flexible", weeklyDays: 2 })
    h.logs = [log(h, "2026-10-05", 30), log(h, "2026-10-06", 30)]
    h.versions.push({
      id: "v2",
      revision: 2,
      effectiveFrom: "2026-10-07",
      config: { ...h.versions[0].config, weeklyDays: 3 },
    })
    const a = analyse(h)
    expect(a.periods).toHaveLength(2)
    expect(a.periods[0]).toMatchObject({
      start: "2026-10-05",
      end: "2026-10-06",
      amount: 2,
      target: 2,
      complete: true,
    })
    expect(a.periods[1]).toMatchObject({
      start: "2026-10-07",
      end: "2026-10-11",
      amount: 0,
      target: 3,
    })
  })
  it("uses saved civil dates and elapsed work for overnight and DST sessions", () => {
    const h = habit()
    h.versions[0].effectiveFrom = "2026-03-01"
    h.versions[0].config.startDate = "2026-03-01"
    h.logs = [
      log(h, "2026-03-07", 30, {
        source: "timer",
        elapsedMs: 1800000,
        timezone: "America/New_York",
        sessionId: "overnight",
        notes: "Across midnight",
      }),
      log(h, "2026-03-08", 90, {
        source: "timer",
        elapsedMs: 5400000,
        timezone: "America/New_York",
        sessionId: "overnight",
        notes: "Across midnight",
      }),
    ]
    const a = analyse(h, "2026-03-09", "2026-03-07", "2026-03-08")
    expect(a.days.map((d) => d.minutes)).toEqual([30, 90])
    expect(a.summary.minutes).toBe(120)
    expect(a.notes).toHaveLength(1)
  })
  it("counts closed periods consistently across range filters and excludes future misses", () => {
    const h = habit({ goalPeriod: "week", target: 60 })
    h.logs = [log(h, "2026-10-05", 60)]
    const a = analyse(h, "2026-10-12", "2026-10-05", "2026-10-18")
    expect(a.range).toMatchObject({ eligible: 1, completed: 1, rate: 100 })
    expect(
      a.days
        .filter((d) => d.date >= "2026-10-12")
        .every((d) => d.state !== "missed")
    ).toBe(true)
    expect(a.trend.at(-1)).toMatchObject({
      eligible: 1,
      completed: 1,
      rate: 100,
    })
    expect(
      analyse(h, "2026-10-12", "2026-10-05", "2026-10-05").timeWeeks[0].target
    ).toBe(0)
  })
  it("rounds fractional progress before comparing it with a target", () => {
    const h = habit({ target: 0.8 })
    h.logs = [log(h, "2026-10-05", 0.1), log(h, "2026-10-05", 0.7)]
    expect(analyse(h).days[0]).toMatchObject({
      goalAmount: 0.8,
      state: "complete",
    })
  })
})
