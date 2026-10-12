import { describe, expect, it } from "vitest"
import {
  habitStreaks,
  weeklyHabitProgress,
} from "@/lib/overview/habit-sections"
import {
  addDays,
  defaultConfig,
  goalPeriod,
  versionOn,
  type Habit,
  type HabitBundle,
  type HabitConfig,
  type HabitLog,
} from "@/lib/habits/model"

const today = "2026-10-08"
function habit(id: string, config: Partial<HabitConfig> = {}): Habit {
  return {
    id,
    name: id,
    reason: "",
    icon: "📖",
    color: "orange",
    status: "active",
    revision: 1,
    versions: [
      {
        id: `${id}-v1`,
        effectiveFrom: "2026-10-05",
        revision: 1,
        config: {
          ...defaultConfig("2026-10-05", 1),
          goalType: "done",
          target: 1,
          ...config,
        },
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
  const version = versionOn(h, date)!,
    period = goalPeriod(version.config, date, version.effectiveFrom)
  return {
    id: `${h.id}-${date}-${h.logs.length}`,
    date,
    amount,
    versionId: version.id,
    periodStart: period.start,
    periodEnd: period.end,
    kind: "progress",
    source: "manual",
    notes: "",
    revision: 1,
    deleted: false,
    ...patch,
  }
}
const bundle = (
  items: Habit[],
  patch: Partial<HabitBundle> = {}
): HabitBundle => ({
  items,
  today,
  date: today,
  timezone: "Asia/Kolkata",
  weekStart: 1,
  ...patch,
})

describe("overview habit summaries", () => {
  it("keeps long streaks across month boundaries and ignores rest, skipped, paused and future habits", () => {
    const long = habit("Long", { startDate: "2026-09-01" })
    long.versions[0].effectiveFrom = "2026-09-01"
    long.states[0].date = "2026-09-01"
    for (let date = "2026-09-01"; date < today; date = addDays(date, 1))
      long.logs.push(log(long, date, 1))
    const spaced = habit("Spaced", {
      schedule: "weekdays",
      weekdays: [1, 3, 4],
    })
    spaced.logs = [
      log(spaced, "2026-10-05", 1),
      log(spaced, "2026-10-07", 0, { kind: "skip" }),
    ]
    const paused = { ...habit("Paused"), status: "paused" as const }
    const future = habit("Future", { startDate: "2026-10-09" })
    future.versions[0].effectiveFrom = "2026-10-09"
    const result = habitStreaks(bundle([paused, future, spaced, long]))
    expect(result.items.map((h) => [h.id, h.current, h.best])).toEqual([
      ["Long", 37, 37],
      ["Spaced", 1, 1],
    ])
  })

  it("counts daily, weekly, monthly and flexible goals once without counting future plans", () => {
    const daily = habit("Daily"),
      weekly = habit("Weekly", { goalPeriod: "week" }),
      monthly = habit("Monthly", { goalPeriod: "month" }),
      flexible = habit("Flexible", { schedule: "flexible", weeklyDays: 2 })
    daily.logs = [
      log(daily, "2026-10-05", 1),
      log(daily, "2026-10-06", 0, { kind: "skip" }),
      log(daily, today, 1),
    ]
    weekly.logs = [log(weekly, "2026-10-06", 1)]
    monthly.logs = [log(monthly, "2026-10-07", 1)]
    flexible.logs = [log(flexible, "2026-10-06", 1), log(flexible, today, 1)]
    const result = weeklyHabitProgress(
      bundle([daily, weekly, monthly, flexible])
    )
    expect(
      Object.fromEntries(
        result.items.map((h) => [h.id, [h.completed, h.eligible]])
      )
    ).toEqual({
      Daily: [2, 3],
      Weekly: [1, 1],
      Monthly: [1, 1],
      Flexible: [1, 1],
    })
    expect(result.from).toBe("2026-10-05")
    expect(result.to).toBe("2026-10-11")
    expect(result.items.find((h) => h.id === "Daily")!.days[6].state).not.toBe(
      "missed"
    )
  })

  it("preserves paused effort and timer work without turning plans, deleted entries or non-time sessions into goals", () => {
    const paused = habit("Paused", { goalType: "minutes", target: 30 }),
      noWork = { ...habit("Archived empty"), status: "archived" as const },
      session = habit("Session")
    paused.logs = [
      log(paused, "2026-10-06", 12),
      log(paused, "2026-10-07", 30, { deleted: true }),
    ]
    paused.status = "paused"
    paused.states.push({ status: "paused", date: "2026-10-07" })
    session.logs = [
      log(session, "2026-10-06", 0, {
        kind: "session",
        source: "timer",
        elapsedMs: 600000,
      }),
    ]
    const result = weeklyHabitProgress(bundle([paused, noWork, session]))
    expect(result.items.map((h) => h.id)).toEqual(["Session", "Paused"])
    expect(result.items[0]).toMatchObject({
      minutes: 10,
      completed: 0,
      eligible: 4,
    })
    expect(result.items[1]).toMatchObject({
      minutes: 12,
      completed: 0,
      eligible: 2,
    })
    expect(result.items[1].days[2]).toMatchObject({ minutes: 0 })
  })

  it("uses the saved version's units when goals change from minutes to hours", () => {
    const h = habit("Read", { goalType: "minutes", target: 30 })
    h.versions.push({
      id: "v2",
      effectiveFrom: "2026-10-07",
      revision: 2,
      config: { ...h.versions[0].config, goalType: "hours", target: 1 },
    })
    h.logs = [
      log(h, "2026-10-05", 30),
      log(h, "2026-10-07", 0.5),
      log(h, today, 1),
    ]
    const row = weeklyHabitProgress(bundle([h])).items[0]
    expect(row).toMatchObject({ minutes: 120, completed: 2, eligible: 4 })
    expect(row.days[0].unit).toBe("minutes")
    expect(row.days[2].unit).toBe("hours")
  })

  it("uses account week boundaries and bounds rows without mutating source data", () => {
    const items = Array.from({ length: 7 }, (_, i) => habit(`Habit ${i}`)),
      source = bundle(items, { today: "2026-10-11", weekStart: 0 })
    const before = JSON.stringify(source)
    expect(weeklyHabitProgress(source)).toMatchObject({
      from: "2026-10-11",
      to: "2026-10-17",
      total: 7,
    })
    expect(weeklyHabitProgress(source).items).toHaveLength(5)
    expect(habitStreaks(source).items).toHaveLength(5)
    expect(JSON.stringify(source)).toBe(before)
  })
})
