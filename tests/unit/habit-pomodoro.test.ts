import { describe, expect, it } from "vitest"
import { createHabitSchema, defaultConfig } from "@/lib/habits/model"
import { habitFromStarter, habitStarters } from "@/lib/habits/templates"
import {
  applyTimerCommand,
  breakElapsed,
  segmentTotal,
  splitWorkByDate,
  startTimerSchema,
  timerElapsed,
  timerPhaseRemaining,
  trimSegments,
  type HabitTimer,
  type TimerCommand,
} from "@/lib/habits/timer"
const start = Date.parse("2026-10-12T23:58:00Z")
const minute = 60000
function timer(): HabitTimer {
  return {
    id: crypto.randomUUID(),
    habitId: crypto.randomUUID(),
    name: "Read",
    icon: "📖",
    timezone: "UTC",
    mode: "pomodoro",
    status: "running",
    targetMs: 4 * minute,
    runningSince: start,
    segments: [],
    revision: 1,
    lastActionId: null,
    confirmedMs: null,
    goal: defaultConfig("2026-10-12", 1),
    pomodoro: {
      workMs: 2 * minute,
      breakMs: minute,
      rounds: 2,
      round: 1,
      phase: "work",
      workStartMs: 0,
      breakElapsedMs: 0,
      breakSince: null,
    },
  }
}
function command(
  t: HabitTimer,
  action: TimerCommand["action"],
  at: number,
  fields = {}
): TimerCommand {
  return {
    id: crypto.randomUUID(),
    expectedRevision: t.revision,
    at,
    action,
    ...fields,
  } as TimerCommand
}
const act = (
  t: HabitTimer,
  action: TimerCommand["action"],
  at: number,
  fields = {}
) => applyTimerCommand(t, command(t, action, at, fields), at)
describe("Pomodoro work and breaks", () => {
  it("caps work at its phase end through sleep and recovery", () => {
    const t = JSON.parse(JSON.stringify(timer()))
    expect(timerElapsed(t, start + 40 * minute)).toBe(2 * minute)
    expect(timerPhaseRemaining(t, start + 40 * minute)).toBe(0)
    expect(t.pomodoro.phase).toBe("work")
  })
  it("excludes breaks and the waiting gap before a next work round", () => {
    const b = act(timer(), "next_phase", start + 5 * minute)
    expect(b.pomodoro?.phase).toBe("break")
    expect(b.runningSince).toBeNull()
    expect(timerElapsed(b, start + 10 * minute)).toBe(2 * minute)
    expect(breakElapsed(b, start + 10 * minute)).toBe(minute)
    const next = act(b, "next_phase", start + 10 * minute)
    expect(next.pomodoro?.round).toBe(2)
    expect(timerElapsed(next, start + 11 * minute)).toBe(3 * minute)
    const review = act(next, "review", start + 20 * minute)
    expect(segmentTotal(review.segments)).toBe(4 * minute)
    expect(review.segments).toEqual([
      { start, end: start + 2 * minute },
      { start: start + 10 * minute, end: start + 12 * minute },
    ])
  })
  it("allows explicitly skipping a break without converting it into work", () => {
    const b = act(timer(), "next_phase", start + 2 * minute)
    const next = act(b, "next_phase", start + 2.5 * minute)
    expect(timerElapsed(next, start + 3 * minute)).toBe(2.5 * minute)
  })
  it("keeps pauses out of both work and break clocks", () => {
    const p = act(timer(), "pause", start + minute)
    const r = act(p, "resume", start + 10 * minute)
    expect(timerElapsed(r, start + 11 * minute)).toBe(2 * minute)
    const b = act(r, "next_phase", start + 11 * minute)
    const bp = act(b, "pause", start + 11.25 * minute)
    expect(breakElapsed(bp, start + 50 * minute)).toBe(0.25 * minute)
    const br = act(bp, "resume", start + 50 * minute)
    expect(breakElapsed(br, start + 50.25 * minute)).toBe(0.5 * minute)
    expect(timerElapsed(br, start + 60 * minute)).toBe(2 * minute)
  })
  it("can finish during a break but confirm only tracked work", () => {
    const b = act(timer(), "next_phase", start + 2 * minute)
    expect(() =>
      act(b, "finish", start + 3 * minute, {
        confirmedMs: 3 * minute,
        notes: "",
      })
    ).toThrow("exceed tracked")
    const saved = act(b, "finish", start + 3 * minute, {
      confirmedMs: 2 * minute,
      notes: "",
    })
    expect(saved.status).toBe("finished")
    expect(saved.confirmedMs).toBe(2 * minute)
  })
  it("requires completed work, rejects extra rounds and extra time", () => {
    expect(() => act(timer(), "next_phase", start + minute)).toThrow(
      "Finish this work interval"
    )
    expect(() =>
      act(timer(), "add_time", start + minute, { minutes: 5 })
    ).toThrow()
    const next = act(
      act(timer(), "next_phase", start + 2 * minute),
      "next_phase",
      start + 3 * minute
    )
    expect(() => act(next, "next_phase", start + 5 * minute)).toThrow(
      "All rounds"
    )
    expect(() =>
      act(act(next, "pause", start + 5 * minute), "resume", start + 6 * minute)
    ).toThrow()
  })
  it("replays queued actions once and detects stale transitions", () => {
    const t = timer(),
      c = command(t, "next_phase", start + 2 * minute)
    const b = applyTimerCommand(t, c, start + 2 * minute)
    expect(applyTimerCommand(b, c, start + 10 * minute)).toBe(b)
    expect(() =>
      act({ ...b, revision: 3 }, "next_phase", start + 3 * minute, {
        expectedRevision: 1,
      })
    ).toThrow("another tab")
  })
  it("splits only confirmed work across midnight", () => {
    const b = act(timer(), "next_phase", start + 3 * minute)
    const next = act(b, "next_phase", start + 5 * minute)
    const saved = act(next, "review", start + 7 * minute)
    expect(
      splitWorkByDate(trimSegments(saved.segments, 3 * minute), "UTC")
    ).toEqual([
      { date: "2026-10-12", elapsedMs: 2 * minute },
      { date: "2026-10-13", elapsedMs: minute },
    ])
  })
  it("validates cycle limits without changing existing timer requests", () => {
    const base = {
      id: crypto.randomUUID(),
      habitId: crypto.randomUUID(),
      mode: "pomodoro",
      minutes: 25,
      breakMinutes: 5,
      rounds: 4,
    }
    expect(startTimerSchema.safeParse(base).success).toBe(true)
    for (const patch of [
      { minutes: 121 },
      { breakMinutes: 0 },
      { rounds: 13 },
      { rounds: undefined },
      { mode: "stopwatch" },
    ])
      expect(startTimerSchema.safeParse({ ...base, ...patch }).success).toBe(
        false
      )
    expect(
      startTimerSchema.safeParse({
        id: base.id,
        habitId: base.habitId,
        mode: "countdown",
        minutes: 1440,
      }).success
    ).toBe(true)
  })
})
describe("habit starter templates", () => {
  it.each(habitStarters)(
    "$label is valid, independent and starts on the account's chosen date",
    (item) => {
      const input = habitFromStarter(item.id, "2026-10-12", 0)!
      expect(
        createHabitSchema.safeParse({ id: crypto.randomUUID(), ...input })
          .success
      ).toBe(true)
      expect(input.config).toMatchObject({
        startDate: "2026-10-12",
        weekStart: 0,
        times: [],
        reminders: [],
        endDate: null,
      })
      expect(Object.keys(input).sort()).toEqual([
        "color",
        "config",
        "icon",
        "name",
        "reason",
      ])
    }
  )
  it("provides separate editable copies and ignores unknown starters", () => {
    const first = habitFromStarter("movement", "2026-10-12", 1)!
    first.config.times.push("08:00")
    expect(habitFromStarter("movement", "2026-10-13", 0)?.config.times).toEqual(
      []
    )
    expect(habitFromStarter("missing", "2026-10-12", 1)).toBeNull()
  })
})
