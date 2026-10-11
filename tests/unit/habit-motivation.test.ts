import { describe, expect, it } from "vitest"
import {
  habitJourney,
  rewardCandidates,
  summariseHabitWork,
  motivationPreferencesSchema,
  motivationDefaults,
} from "@/lib/habits/motivation"
import {
  defaultConfig,
  goalPeriod,
  versionOn,
  type Habit,
  type HabitConfig,
  type HabitLog,
} from "@/lib/habits/model"
function habit(config: Partial<HabitConfig> = {}): Habit {
  return {
    id: "habit",
    name: "Read",
    reason: "",
    icon: "📖",
    color: "orange",
    status: "active",
    revision: 1,
    versions: [
      {
        id: "v1",
        revision: 1,
        effectiveFrom: "2026-10-01",
        config: { ...defaultConfig("2026-10-01", 1), ...config },
      },
    ],
    logs: [],
    states: [{ status: "active", date: "2026-10-01" }],
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
    date,
    amount,
    versionId: v.id,
    periodStart: p.start,
    periodEnd: p.end,
    notes: "",
    kind: "progress",
    revision: 1,
    deleted: false,
    ...patch,
  }
}
const journey = (h: Habit, today = "2026-10-11") => habitJourney(h, today, 1)
const earned = (h: Habit) =>
  journey(h)
    .badges.filter((b) => b.earned)
    .map((b) => b.id)
describe("habit motivation from saved records", () => {
  it("never rewards plans, skipped entries, deleted work or a timer without a saved record", () => {
    const h = habit({ times: ["09:00"], reminders: ["08:55"] })
    h.logs = [
      log(h, "2026-10-05", 0, { kind: "skip" }),
      log(h, "2026-10-06", 60, { deleted: true }),
    ]
    const before = JSON.stringify(h)
    expect(earned(h)).toEqual([])
    expect(journey(h).metrics).toEqual({
      minutes: 0,
      effortDays: 0,
      goals: 0,
      weeklyGoals: 0,
      monthlyGoals: 0,
    })
    expect(JSON.stringify(h)).toBe(before)
  })
  it("acknowledges partial work without inventing a completion", () => {
    const h = habit()
    const before = journey(h)
    h.logs = [log(h, "2026-10-11", 18)]
    const after = journey(h)
    expect(after.metrics).toMatchObject({
      minutes: 18,
      goals: 0,
      effortDays: 1,
    })
    expect(
      rewardCandidates(before, after, "2026-10-11").milestones.map((b) => b.id)
    ).toEqual(["first-effort"])
    expect(after.next.find((b) => b.id === "time-60")).toMatchObject({
      value: 18,
      target: 60,
      earned: false,
    })
  })
  it("counts minutes once across saved manual and timer sessions", () => {
    const h = habit()
    h.logs = [
      log(h, "2026-10-05", 18),
      log(h, "2026-10-05", 42, { source: "timer", elapsedMs: 2520000 }),
    ]
    expect(journey(h).metrics).toMatchObject({
      minutes: 60,
      effortDays: 1,
      goals: 1,
    })
    expect(earned(h)).toContain("time-60")
  })
  it("allows quantity/done timers to earn time milestones, never their quantity goal", () => {
    const h = habit({ goalType: "quantity", target: 10, unit: "pages" })
    h.logs = [
      log(h, "2026-10-05", 0, {
        source: "timer",
        kind: "session",
        elapsedMs: 3600000,
      }),
    ]
    expect(journey(h).metrics).toMatchObject({ minutes: 60, goals: 0 })
    expect(earned(h)).toEqual(["first-effort", "time-60"])
    const q = habit({ goalType: "quantity", target: 10, unit: "minutes" })
    q.logs = [log(q, "2026-10-05", 100)]
    expect(journey(q).metrics.minutes).toBe(0)
  })
  it("counts five daily scheduled goals, deduplicating sessions and preferred times", () => {
    const h = habit({ times: ["09:00", "19:00"] })
    for (let d = 5; d <= 9; d++)
      h.logs.push(log(h, `2026-10-0${d}`, 15), log(h, `2026-10-0${d}`, 15))
    expect(journey(h).metrics.goals).toBe(5)
    expect(earned(h)).toContain("goals-5")
  })
  it("keeps extra work visible without awarding scheduled-goal badges for rest days", () => {
    const h = habit({ schedule: "weekdays", weekdays: [1] })
    h.logs = [log(h, "2026-10-06", 60)]
    expect(journey(h).metrics).toMatchObject({ minutes: 60, goals: 0 })
  })
  it("counts a weekly/monthly goal once, even with multiple days of work", () => {
    for (const goalPeriod of ["week", "month"] as const) {
      const h = habit({ goalPeriod, target: 60 })
      h.logs = [log(h, "2026-10-05", 30), log(h, "2026-10-06", 30)]
      expect(journey(h).metrics.goals).toBe(1)
      expect(earned(h)).toContain(
        goalPeriod === "week" ? "weeks-1" : "first-month"
      )
    }
  })
  it("counts flexible daily goals and weekly targets separately", () => {
    const h = habit({ schedule: "flexible", weeklyDays: 2 })
    h.logs = [
      log(h, "2026-10-05", 18),
      log(h, "2026-10-05", 12),
      log(h, "2026-10-07", 30),
    ]
    expect(journey(h).metrics).toMatchObject({ goals: 2, weeklyGoals: 1 })
    expect(earned(h)).toContain("weeks-1")
    h.status = "archived"
    h.states.push({ status: "archived", date: "2026-10-07" })
    expect(journey(h, "2026-10-07").metrics).toMatchObject({
      goals: 2,
      weeklyGoals: 1,
    })
  })
  it("recalculates milestone eligibility after correction/delete/Undo", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-05", 60)]
    expect(earned(h)).toContain("time-60")
    h.logs[0].amount = 18
    expect(earned(h)).not.toContain("time-60")
    h.logs[0].deleted = true
    expect(earned(h)).toEqual([])
    h.logs[0].deleted = false
    expect(earned(h)).toEqual(["first-effort"])
  })
  it("preserves historical units and targets, including archived history", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-05", 60)]
    h.versions.push({
      id: "v2",
      revision: 2,
      effectiveFrom: "2026-10-06",
      config: {
        ...h.versions[0].config,
        goalType: "quantity",
        unit: "pages",
        target: 10,
      },
    })
    h.logs.push(log(h, "2026-10-07", 10))
    h.status = "archived"
    h.states.push({ status: "archived", date: "2026-10-08" })
    expect(journey(h).metrics).toMatchObject({ minutes: 60, goals: 2 })
    expect(journey(h).nudge).toBeNull()
  })
  it("returns only newly crossed thresholds; repeat analysis creates no reward", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-05", 60)]
    const before = journey(h)
    h.logs.push(log(h, "2026-10-06", 18))
    expect(
      rewardCandidates(before, journey(h), "2026-10-11").milestones
    ).toEqual([])
  })
  it("welcomes saved effort after seven days, once, without rewarding a backdate", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-01", 18)]
    expect(journey(h).nudge).toMatch(/Welcome back/)
    const before = journey(h)
    h.logs.push(log(h, "2026-10-11", 5))
    const after = journey(h)
    expect(rewardCandidates(before, after, "2026-10-11").returning).toBe(true)
    expect(rewardCandidates(after, after, "2026-10-11").returning).toBe(false)
    h.logs.pop()
    h.logs.push(log(h, "2026-10-03", 5))
    expect(rewardCandidates(before, journey(h), "2026-10-11").returning).toBe(
      false
    )
  })
  it("doesn't nudge paused/future/ended habits or a habit already worked on today", () => {
    const h = habit()
    h.status = "paused"
    expect(journey(h).nudge).toBeNull()
    h.status = "active"
    h.versions[0].config.startDate = "2026-10-20"
    expect(journey(h).nudge).toBeNull()
    h.versions[0].config.startDate = "2026-10-01"
    h.versions[0].config.endDate = "2026-10-09"
    expect(journey(h).nudge).toBeNull()
    h.versions[0].config.endDate = null
    h.logs = [log(h, "2026-10-11", 5)]
    expect(journey(h).nudge).toBeNull()
  })
  it("uses account week boundaries for real daily/weekly recaps", () => {
    const h = habit()
    h.logs = [
      log(h, "2026-10-04", 18),
      log(h, "2026-10-05", 12),
      log(h, "2026-10-11", 30),
    ]
    const j = habitJourney(h, "2026-10-11", 0)
    expect(j.week).toMatchObject({ from: "2026-10-11", days: 1, minutes: 30 })
    expect(j.previousWeek).toMatchObject({
      from: "2026-10-04",
      to: "2026-10-10",
      days: 2,
      minutes: 30,
    })
  })
  it("aggregates distinct days across habits and retains archived partial work", () => {
    const a = habit(),
      b = habit({ goalType: "quantity", unit: "pages" })
    b.id = "other"
    b.status = "archived"
    a.logs = [
      log(a, "2026-10-05", 18),
      log(a, "2026-10-06", 0, { kind: "skip" }),
    ]
    b.logs = [log(b, "2026-10-05", 3)]
    expect(
      summariseHabitWork([a, b], "2026-10-05", "2026-10-11")
    ).toMatchObject({ days: 1, habits: 2, minutes: 18 })
  })
  it("counts saved overnight/DST splits as work without duplicating session minutes", () => {
    const h = habit(),
      sessionId = "same"
    h.logs = [
      log(h, "2026-10-05", 30, {
        source: "timer",
        elapsedMs: 1800000,
        sessionId,
        timezone: "America/New_York",
      }),
      log(h, "2026-10-06", 30, {
        source: "timer",
        elapsedMs: 1800000,
        sessionId,
        timezone: "America/New_York",
      }),
    ]
    expect(journey(h).metrics).toMatchObject({
      minutes: 60,
      effortDays: 2,
      goals: 2,
    })
  })
})
describe("motivation preferences", () => {
  it("defaults to sound off and validates partial, boolean-only settings", () => {
    expect(motivationDefaults.sound).toBe(false)
    expect(motivationPreferencesSchema.parse({ quiet: true })).toEqual({
      quiet: true,
    })
    expect(
      motivationPreferencesSchema.safeParse({ sound: "true" }).success
    ).toBe(false)
    expect(
      motivationPreferencesSchema.safeParse({ userId: "other", quiet: true })
        .success
    ).toBe(false)
    expect(motivationPreferencesSchema.safeParse({}).success).toBe(false)
  })
})
