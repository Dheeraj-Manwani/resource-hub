import { describe, expect, it } from "vitest"
import {
  defaultConfig,
  goalPeriod,
  versionOn,
  type Habit,
  type HabitConfig,
  type HabitLog,
} from "@/lib/habits/model"
import {
  calendarBlocks,
  flexibleTargets,
  dueHabitReminderRows,
  recordedMinutes,
  wallTime,
  habitRangeSchema,
  habitPlanSchema,
  type HabitPlanEdit,
} from "@/lib/habits/planning"
import { csvCell, habitsCsv } from "@/lib/habits/csv"

const today = "2026-10-11"
function habit(config: Partial<HabitConfig> = {}): Habit {
  return {
    id: "habit",
    name: "Read",
    reason: "For curiosity",
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
    states: [{ status: "active", date: "2026-01-01" }],
    logs: [],
    plans: [],
  }
}
function edit(patch: Partial<HabitPlanEdit> = {}): HabitPlanEdit {
  return {
    id: "plan",
    revision: 2,
    versionId: "v1",
    scope: "this",
    sourceDate: today,
    sourceSlot: "all-day",
    date: "2026-10-12",
    time: "10:00",
    minutes: 45,
    canceled: false,
    ...patch,
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
    revision: 1,
    deleted: false,
    ...patch,
  }
}
const blocks = (h: Habit, from = today, to = from, zone = "Asia/Kolkata") =>
  calendarBlocks(h, from, to, today, zone)

describe("habit plans are separate from recorded work", () => {
  it("renders timed and all-day plans without mutating logs or goals", () => {
    const h = habit({ times: ["09:00", "19:00"] }),
      before = JSON.stringify(h)
    const rows = blocks(h)
    expect(rows).toHaveLength(2)
    expect(new Date(rows[0].start).toISOString()).toBe(
      "2026-10-11T03:30:00.000Z"
    )
    expect(
      rows.every(
        (r) => r.amount === 0 && r.recordedMinutes === 0 && !r.complete
      )
    ).toBe(true)
    expect(JSON.stringify(h)).toBe(before)
    expect(blocks(habit())[0]).toMatchObject({
      start: today,
      allDay: true,
      end: null,
    })
  })
  it("moves one occurrence across months without adding or losing the original identity", () => {
    const h = habit()
    h.plans = [edit({ date: "2026-11-02" })]
    expect(blocks(h)).toHaveLength(0)
    const moved = blocks(h, "2026-11-02").filter((r) => r.sourceDate === today)
    expect(moved).toHaveLength(1)
    expect(moved[0].id).toBe(blocks(habit())[0].id)
    expect(moved[0]).toMatchObject({
      date: "2026-11-02",
      time: "10:00",
      minutes: 45,
      amount: 0,
    })
  })
  it("applies future changes to just one time slot and respects individual overrides", () => {
    const h = habit({ times: ["09:00", "19:00"] })
    h.plans = [
      edit({
        scope: "following",
        sourceSlot: "time:09:00",
        date: today,
        time: "11:00",
      }),
      edit({
        id: "override",
        revision: 3,
        sourceDate: "2026-10-12",
        sourceSlot: "time:09:00",
        date: "2026-10-12",
        time: "12:00",
      }),
    ]
    expect(blocks(h, today, "2026-10-12").map((r) => r.time)).toEqual([
      "11:00",
      "19:00",
      "12:00",
      "19:00",
    ])
  })
  it("stops future rules at the next schedule version", () => {
    const h = habit()
    h.plans = [edit({ scope: "following", date: today })]
    h.versions.push({
      ...h.versions[0],
      id: "v2",
      revision: 3,
      effectiveFrom: "2026-10-12",
      config: { ...h.versions[0].config, times: ["14:00"] },
    })
    expect(blocks(h, today, "2026-10-12").map((r) => r.time)).toEqual([
      "10:00",
      "14:00",
    ])
  })
  it("supports cancellation and chosen days for flexible targets without inventing weekdays", () => {
    const h = habit({ schedule: "flexible", weeklyDays: 3 })
    expect(blocks(h, today, "2026-10-18")).toHaveLength(0)
    expect(flexibleTargets(h, "2026-10-12", "2026-10-18", today)).toMatchObject(
      [{ days: 0, target: 3 }]
    )
    expect(
      flexibleTargets(h, "2026-10-01", "2026-10-04", today)[0].planDate
    ).toBeNull()
    h.plans = [edit({ scope: "extra", sourceSlot: "extra:plan", date: today })]
    expect(blocks(h)).toHaveLength(1)
    h.plans.push(
      edit({ revision: 3, sourceSlot: "extra:plan", canceled: true })
    )
    expect(blocks(h)).toHaveLength(0)
  })
  it("shows saved progress on every prompt but counts the work once", () => {
    const h = habit({ times: ["09:00", "19:00"] })
    h.logs = [log(h, today, 18), log(h, today, 12, { deleted: true })]
    expect(
      blocks(h).every(
        (r) =>
          r.partial &&
          !r.editable &&
          r.amount === 18 &&
          r.recordedMinutes === 18
      )
    ).toBe(true)
    h.logs.push(log(h, today, 12))
    expect(blocks(h).every((r) => r.complete && r.recordedMinutes === 30)).toBe(
      true
    )
  })
  it("counts quantity timers as work time without inventing quantity progress", () => {
    const h = habit({ goalType: "quantity", target: 10, unit: "pages" })
    h.logs = [
      log(h, today, 5),
      log(h, today, 0, { kind: "session", source: "timer", elapsedMs: 120000 }),
    ]
    expect(recordedMinutes(h, today)).toBe(2)
    expect(blocks(h)[0]).toMatchObject({
      amount: 5,
      recordedMinutes: 2,
      complete: false,
    })
  })
  it("honors pauses and historical schedule boundaries", () => {
    const h = habit({ schedule: "weekdays", weekdays: [1] })
    expect(blocks(h, today, "2026-10-12")).toHaveLength(1)
    h.status = "paused"
    expect(blocks(h, today, "2026-10-12")).toHaveLength(0)
    expect(blocks(h, "2026-10-05")).toHaveLength(1)
  })
  it("uses account timezone and actual planned duration across DST", () => {
    const h = habit({ times: ["01:30"], defaultDuration: 120 })
    const b = blocks(h, "2026-03-08", "2026-03-08", "America/New_York")[0]
    expect(new Date(b.start).toISOString()).toBe("2026-03-08T06:30:00.000Z")
    expect(b.end).toBe("2026-03-08T08:30:00.000Z")
    expect(
      new Date(
        wallTime("2026-03-08", "02:30", "America/New_York").getTime()
      ).toISOString()
    ).toBe("2026-03-08T07:30:00.000Z")
  })
  it("validates ranges and rejects invalid times and association fields", () => {
    expect(
      habitRangeSchema.safeParse({ from: today, to: "2027-01-31" }).success
    ).toBe(false)
    const data = {
      id: crypto.randomUUID(),
      expectedRevision: 1,
      scope: "extra",
      date: today,
      time: "10:00",
      minutes: 30,
    }
    expect(habitPlanSchema.safeParse(data).success).toBe(true)
    expect(habitPlanSchema.safeParse({ ...data, time: "25:00" }).success).toBe(
      false
    )
    expect(
      habitPlanSchema.safeParse({ ...data, projectId: "project" }).success
    ).toBe(false)
  })
})
describe("explicit habit reminders", () => {
  const now = new Date("2026-10-11T04:00Z")
  it("delivers due prompts once per reminder slot, never ahead of time", () => {
    const h = habit({
      reminders: ["09:00", "10:00"],
      times: ["09:00", "19:00"],
    })
    expect(
      dueHabitReminderRows(h, [], now, "Asia/Kolkata").map((r) => r.time)
    ).toEqual(["10:00", "09:00"])
    expect(h.logs).toHaveLength(0)
  })
  it("keeps dismissed reminders hidden and snoozed reminders waiting until their new time", () => {
    const h = habit({ reminders: ["09:00"] }),
      row = {
        versionId: "v1",
        date: today,
        time: "09:00",
        dismissedAt: null,
        snoozedUntil: "2026-10-11T04:10:00Z",
      }
    expect(
      dueHabitReminderRows(h, [row], now, "Asia/Kolkata").some(
        (r) => r.date === today
      )
    ).toBe(false)
    expect(
      dueHabitReminderRows(
        h,
        [row],
        new Date("2026-10-11T04:11Z"),
        "Asia/Kolkata"
      ).find((r) => r.date === today)?.notifyAt
    ).toBe(row.snoozedUntil)
    expect(
      dueHabitReminderRows(
        h,
        [{ ...row, dismissedAt: now.toISOString() }],
        now,
        "Asia/Kolkata"
      ).some((r) => r.date === today)
    ).toBe(false)
  })
  it("suppresses completed, skipped, paused and canceled days", () => {
    for (const kind of ["complete", "skip", "pause", "cancel"] as const) {
      const h = habit({ startDate: today, reminders: ["09:00"] })
      if (kind === "complete") h.logs = [log(h, today, 30)]
      if (kind === "skip") h.logs = [log(h, today, 0, { kind: "skip" })]
      if (kind === "pause") h.status = "paused"
      if (kind === "cancel") h.plans = [edit({ date: today, canceled: true })]
      expect(dueHabitReminderRows(h, [], now, "Asia/Kolkata")).toHaveLength(0)
    }
  })
  it("reminds flexible habits only on explicitly chosen dates", () => {
    const h = habit({ schedule: "flexible", reminders: ["09:00"] })
    expect(dueHabitReminderRows(h, [], now, "Asia/Kolkata")).toHaveLength(0)
    h.plans = [edit({ scope: "extra", sourceSlot: "extra:plan", date: today })]
    expect(dueHabitReminderRows(h, [], now, "Asia/Kolkata")).toHaveLength(1)
  })
})
describe("habit CSV", () => {
  it("quotes embedded newlines and quotes and prevents text formula execution", () => {
    expect(csvCell('A,"B"\nC')).toBe('"A,""B""\nC"')
    expect(csvCell(" =SUM(A1)")).toBe('"\' =SUM(A1)"')
    expect(csvCell(-5)).toBe('"-5"')
  })
  it("includes archived habits, empty habits, deleted entries and older history", () => {
    const h = habit()
    h.status = "archived"
    h.logs = [
      log(h, "2026-01-02", 18, { notes: "Earlier work", deleted: true }),
    ]
    const csv = habitsCsv([h, habit()])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain('"archived"')
    expect(csv).toContain('"2026-01-02"')
    expect(csv).toContain('"Earlier work"')
    expect(csv).toContain('"true"')
    expect(csv).toContain('"For curiosity"')
  })
})
