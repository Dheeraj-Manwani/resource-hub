import { describe, expect, it } from "vitest"
import {
  addDays,
  createHabitSchema,
  defaultConfig,
  flexibleProgress,
  goalPeriod,
  goalLabel,
  goalMinutes,
  timerGoalAmount,
  isScheduled,
  monthBounds,
  nextEffectiveDate,
  progressOn,
  statusOn,
  todayIn,
  upcomingDates,
  versionOn,
  weekDates,
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
        effectiveFrom: "2026-01-01",
        config: { ...defaultConfig("2026-01-01", 1), ...config },
      },
    ],
    logs: [],
    states: [{ status: "active", date: "2026-01-01" }],
  }
}
function log(
  h: Habit,
  date: string,
  amount: number,
  patch: Partial<HabitLog> = {}
): HabitLog {
  const version = versionOn(h, date)!
  const period = goalPeriod(version.config, date, version.effectiveFrom)
  return {
    id: crypto.randomUUID(),
    date,
    amount,
    kind: "progress",
    versionId: version.id,
    periodStart: period.start,
    periodEnd: period.end,
    notes: "",
    revision: 1,
    deleted: false,
    ...patch,
  }
}
describe("habit civil dates and schedules", () => {
  it("uses account timezone across midnight and DST", () => {
    expect(todayIn("Asia/Kolkata", new Date("2026-01-01T20:00Z"))).toBe(
      "2026-01-02"
    )
    expect(todayIn("America/New_York", new Date("2026-03-08T06:59Z"))).toBe(
      "2026-03-08"
    )
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09")
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29")
    expect(monthBounds("2026-12-15").end).toBe("2026-12-31")
  })
  it("respects week-start preferences", () => {
    expect(weekDates("2026-10-11", 1)[0]).toBe("2026-10-05")
    expect(weekDates("2026-10-11", 0)[0]).toBe("2026-10-11")
  })
  it("enforces start/end dates and selected weekdays", () => {
    const c = habit({
      schedule: "weekdays",
      weekdays: [1, 3],
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    }).versions[0].config
    expect(isScheduled(c, "2026-10-05")).toBe(true)
    expect(isScheduled(c, "2026-10-06")).toBe(false)
    expect(isScheduled(c, "2026-09-30")).toBe(false)
    expect(isScheduled(c, "2026-11-02")).toBe(false)
    expect(upcomingDates(c, "2026-10-01", 3)).toEqual([
      "2026-10-05",
      "2026-10-07",
      "2026-10-12",
    ])
  })
  it("anchors intervals to the start date across months", () => {
    const c = habit({
      schedule: "interval",
      startDate: "2026-01-30",
      intervalDays: 3,
    }).versions[0].config
    expect(upcomingDates(c, "2026-01-31", 3)).toEqual([
      "2026-02-02",
      "2026-02-05",
      "2026-02-08",
    ])
  })
  it("handles missing monthly dates explicitly and deduplicates the last day", () => {
    const c = habit({ schedule: "monthly", monthDays: [30, 31] }).versions[0]
      .config
    expect(isScheduled(c, "2026-02-28")).toBe(false)
    expect(isScheduled({ ...c, missingDate: "last_day" }, "2026-02-28")).toBe(
      true
    )
    expect(
      upcomingDates({ ...c, missingDate: "last_day" }, "2026-02-01", 3)
    ).toEqual(["2026-02-28", "2026-03-30", "2026-03-31"])
    expect(
      isScheduled(
        { ...c, monthDays: [29], startDate: "2024-01-01" },
        "2024-02-29"
      )
    ).toBe(true)
  })
  it("does not invent fixed days for flexible weekly targets", () => {
    const c = habit({ schedule: "flexible", weeklyDays: 3 }).versions[0].config
    expect(upcomingDates(c, "2026-10-11")).toEqual([])
    expect(isScheduled(c, "2026-10-11")).toBe(true)
  })
})
describe("habit progress and immutable goal history", () => {
  it("converts fractional hours and timer work without treating quantities as time", () => {
    const config = {
      ...defaultConfig("2026-10-01", 1),
      goalType: "hours" as const,
      target: 4,
    }
    expect(goalLabel(config)).toBe("4 hours per day")
    expect(goalMinutes(config, 1.5)).toBe(90)
    expect(timerGoalAmount(config, 5400000)).toBe(1.5)
    expect(timerGoalAmount({ goalType: "minutes" }, 5400000)).toBe(90)
    expect(goalMinutes({ goalType: "quantity" }, 4)).toBe(0)
    expect(timerGoalAmount({ goalType: "done" }, 5400000)).toBe(0)
  })
  it.each(["done", "quantity", "minutes", "hours"] as const)(
    "supports %s goals and ignores deleted entries",
    (goalType) => {
      const h = habit({
        goalType,
        target: goalType === "done" ? 1 : 30,
        unit: "pages",
      })
      h.logs = [
        log(h, "2026-10-11", goalType === "done" ? 1 : 18),
        log(h, "2026-10-11", 12, { deleted: true }),
      ]
      expect(progressOn(h, "2026-10-11")?.complete).toBe(goalType === "done")
      if (goalType !== "done") {
        h.logs.push(log(h, "2026-10-11", 12))
        expect(progressOn(h, "2026-10-11")?.complete).toBe(true)
      }
      expect(progressOn(h, "2026-10-12")?.amount).toBe(0)
    }
  )
  it("sums weekly/monthly entries over their full goal period", () => {
    const weekly = habit({ goalPeriod: "week", target: 60 })
    weekly.logs = [
      log(weekly, "2026-10-05", 30),
      log(weekly, "2026-10-10", 30),
      log(weekly, "2026-10-12", 30),
    ]
    expect(progressOn(weekly, "2026-10-11")?.amount).toBe(60)
    expect(nextEffectiveDate(weekly, "2026-10-11")).toBe("2026-10-12")
    const monthly = habit({ goalPeriod: "month", target: 60 })
    monthly.logs = [
      log(monthly, "2026-10-01", 30),
      log(monthly, "2026-10-31", 30),
    ]
    expect(progressOn(monthly, "2026-10-11")?.amount).toBe(60)
    expect(nextEffectiveDate(monthly, "2026-10-11")).toBe("2026-11-01")
  })
  it("counts distinct completed days for flexible habits, never log count or skips", () => {
    const h = habit({ schedule: "flexible", weeklyDays: 3 })
    h.logs = [
      log(h, "2026-10-05", 18),
      log(h, "2026-10-05", 12),
      log(h, "2026-10-06", 10),
      log(h, "2026-10-07", 0, { kind: "skip" }),
    ]
    expect(flexibleProgress(h, "2026-10-11")).toEqual({ days: 1, target: 3 })
    expect(progressOn(h, "2026-10-07")?.skipped).toBe(true)
    expect(progressOn(h, "2026-10-07")?.complete).toBe(false)
    h.logs.push(log(h, "2026-10-07", 5))
    expect(progressOn(h, "2026-10-07")?.skipped).toBe(false)
  })
  it("keeps earlier targets and periods after a future edit", () => {
    const h = habit()
    h.logs = [log(h, "2026-10-11", 30)]
    h.versions.push({
      id: "v2",
      revision: 2,
      effectiveFrom: "2026-10-12",
      config: {
        ...h.versions[0].config,
        target: 60,
        schedule: "weekdays",
        weekdays: [1],
      },
    })
    expect(progressOn(h, "2026-10-11")?.complete).toBe(true)
    expect(progressOn(h, "2026-10-11")?.target).toBe(30)
    expect(progressOn(h, "2026-10-12")?.target).toBe(60)
    expect(progressOn(h, "2026-10-12")?.amount).toBe(0)
  })
  it("chooses the latest revision when a pending schedule is corrected", () => {
    const h = habit()
    h.versions.push(
      {
        id: "v2",
        revision: 2,
        effectiveFrom: "2026-10-12",
        config: { ...h.versions[0].config, target: 60 },
      },
      {
        id: "v3",
        revision: 3,
        effectiveFrom: "2026-10-12",
        config: { ...h.versions[0].config, target: 45 },
      }
    )
    expect(progressOn(h, "2026-10-12")?.target).toBe(45)
  })
  it("preserves paused history after restart and shows current status for future plans", () => {
    const h = habit()
    h.states.push(
      { status: "paused", date: "2026-10-06" },
      { status: "active", date: "2026-10-09" }
    )
    expect(statusOn(h, "2026-10-07", "2026-10-11")).toBe("paused")
    expect(statusOn(h, "2026-10-10", "2026-10-11")).toBe("active")
    h.status = "archived"
    expect(statusOn(h, "2026-10-12", "2026-10-11")).toBe("archived")
  })
  it("rejects entity associations, malformed dates, impossible goals and empty schedules", () => {
    const input = {
      id: crypto.randomUUID(),
      name: "Read",
      reason: "",
      icon: "📖",
      color: "orange",
      config: defaultConfig("2026-10-11", 1),
    }
    expect(createHabitSchema.safeParse(input).success).toBe(true)
    expect(
      createHabitSchema.safeParse({ ...input, projectId: crypto.randomUUID() })
        .success
    ).toBe(false)
    expect(
      createHabitSchema.safeParse({
        ...input,
        config: { ...input.config, startDate: "2026-02-30" },
      }).success
    ).toBe(false)
    expect(
      createHabitSchema.safeParse({
        ...input,
        config: { ...input.config, goalType: "done", target: 30 },
      }).success
    ).toBe(false)
    expect(
      createHabitSchema.safeParse({
        ...input,
        config: { ...input.config, schedule: "weekdays", weekdays: [] },
      }).success
    ).toBe(false)
    expect(
      createHabitSchema.safeParse({
        ...input,
        config: { ...input.config, schedule: "flexible", goalPeriod: "week" },
      }).success
    ).toBe(false)
  })
})
