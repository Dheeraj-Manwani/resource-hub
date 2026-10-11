import { describe, expect, it } from "vitest"
import { defaultConfig } from "@/lib/habits/model"
import {
  applyTimerCommand,
  formatTimer,
  MAX_TIMER_MS,
  segmentTotal,
  splitWorkByDate,
  timerCommandSchema,
  timerElapsed,
  trimSegments,
  type HabitTimer,
  type TimerCommand,
} from "@/lib/habits/timer"
const start = Date.parse("2026-10-11T10:00Z")
function timer(patch: Partial<HabitTimer> = {}): HabitTimer {
  return {
    id: crypto.randomUUID(),
    habitId: crypto.randomUUID(),
    name: "Read",
    icon: "📖",
    timezone: "UTC",
    mode: "countdown",
    status: "running",
    targetMs: 30 * 60000,
    runningSince: start,
    segments: [],
    revision: 1,
    goal: defaultConfig("2026-10-11", 1),
    lastActionId: null,
    confirmedMs: null,
    ...patch,
  }
}
function command(
  t: HabitTimer,
  action: TimerCommand["action"],
  at: number,
  patch: Record<string, unknown> = {}
): TimerCommand {
  return {
    id: crypto.randomUUID(),
    expectedRevision: t.revision,
    action,
    at,
    ...patch,
  } as TimerCommand
}
describe("habit timer work accounting", () => {
  it("uses timestamps through refreshes and background throttling", () => {
    const active = timer()
    expect(
      timerElapsed(JSON.parse(JSON.stringify(active)), start + 123000)
    ).toBe(123000)
    expect(timerElapsed(active, start - 100)).toBe(0)
  })
  it("excludes every pause and preserves intervals after resume", () => {
    const paused = applyTimerCommand(
      timer(),
      command(timer(), "pause", start + 120000),
      start + 120000
    )
    expect(timerElapsed(paused, start + 600000)).toBe(120000)
    const resumed = applyTimerCommand(
      paused,
      command(paused, "resume", start + 600000),
      start + 600000
    )
    const review = applyTimerCommand(
      resumed,
      command(resumed, "review", start + 660000),
      start + 660000
    )
    expect(timerElapsed(review, start + 999000)).toBe(180000)
    expect(review.segments).toEqual([
      { start, end: start + 120000 },
      { start: start + 600000, end: start + 660000 },
    ])
  })
  it("caps an expired countdown and omits the gap before extra time", () => {
    const active = timer({ targetMs: 60000 })
    expect(timerElapsed(active, start + 3600000)).toBe(60000)
    const extended = applyTimerCommand(
      active,
      command(active, "add_time", start + 120000, { minutes: 5 }),
      start + 120000
    )
    expect(extended.targetMs).toBe(360000)
    expect(timerElapsed(extended, start + 150000)).toBe(90000)
  })
  it("keeps added time paused until the user resumes", () => {
    const active = timer({
      status: "paused",
      runningSince: null,
      segments: [{ start, end: start + 60000 }],
    })
    const extended = applyTimerCommand(
      active,
      command(active, "add_time", start + 120000, { minutes: 5 }),
      start + 120000
    )
    expect(extended.status).toBe("paused")
    expect(timerElapsed(extended, start + 1000000)).toBe(60000)
  })
  it("does not duplicate a repeated command and rejects stale revisions", () => {
    const active = timer()
    const pause = command(active, "pause", start + 1000)
    const paused = applyTimerCommand(active, pause, start + 1000)
    expect(applyTimerCommand(paused, pause, start + 5000)).toBe(paused)
    expect(() =>
      applyTimerCommand(
        paused,
        { ...pause, id: crypto.randomUUID() },
        start + 5000
      )
    ).toThrow("another tab or device")
  })
  it("requires explicit confirmed time and supports finishing early", () => {
    const active = timer()
    const review = applyTimerCommand(
      active,
      command(active, "review", start + 120000),
      start + 120000
    )
    const saved = applyTimerCommand(
      review,
      command(review, "finish", start + 240000, {
        confirmedMs: 60000,
        notes: "",
      }),
      start + 240000
    )
    expect(saved.confirmedMs).toBe(60000)
    expect(saved.status).toBe("finished")
    expect(() =>
      applyTimerCommand(
        review,
        command(review, "finish", start + 240000, {
          confirmedMs: 180000,
          notes: "",
        }),
        start + 240000
      )
    ).toThrow("cannot exceed")
  })
  it("never counts time after review/discard and bounds abandoned stopwatches", () => {
    const active = timer({ mode: "stopwatch" })
    expect(timerElapsed(active, start + 2 * MAX_TIMER_MS)).toBe(MAX_TIMER_MS)
    const discarded = applyTimerCommand(
      active,
      command(active, "discard", start + 1000),
      start + 1000
    )
    expect(timerElapsed(discarded, start + 500000)).toBe(1000)
    expect(() =>
      applyTimerCommand(
        discarded,
        command(discarded, "resume", start + 500000),
        start + 500000
      )
    ).toThrow("already ended")
  })
  it("clamps delayed offline commands to their original click timestamp", () => {
    const active = timer()
    const paused = applyTimerCommand(
      active,
      command(active, "pause", start + 60000),
      start + 300000
    )
    expect(timerElapsed(paused, start + 300000)).toBe(60000)
    const resumed = applyTimerCommand(
      paused,
      command(paused, "resume", start + 120000),
      start + 300000
    )
    expect(timerElapsed(resumed, start + 300000)).toBe(240000)
  })
  it("requires extra time before resuming an expired countdown", () => {
    const expired = timer({
      status: "review",
      runningSince: null,
      targetMs: 60000,
      segments: [{ start, end: start + 60000 }],
    })
    expect(() =>
      applyTimerCommand(
        expired,
        command(expired, "resume", start + 120000),
        start + 120000
      )
    ).toThrow("Add time")
  })
  it("rejects malformed commands and formats hours", () => {
    expect(
      timerCommandSchema.safeParse({
        id: crypto.randomUUID(),
        expectedRevision: 1,
        at: start,
        action: "finish",
        confirmedMs: 0,
        notes: "",
      }).success
    ).toBe(false)
    expect(formatTimer(3661000)).toBe("1:01:01")
    expect(formatTimer(59000)).toBe("00:59")
  })
})
describe("confirmed work and timezone splitting", () => {
  it("trims from working intervals, never from a paused gap", () => {
    const segments = [
      { start, end: start + 120000 },
      { start: start + 600000, end: start + 660000 },
    ]
    const trimmed = trimSegments(segments, 150000)
    expect(segmentTotal(trimmed)).toBe(150000)
    expect(trimmed.at(-1)?.end).toBe(start + 630000)
  })
  it("splits overnight work using the session timezone", () => {
    expect(
      splitWorkByDate(
        [
          {
            start: Date.parse("2026-10-11T18:15Z"),
            end: Date.parse("2026-10-11T18:45Z"),
          },
        ],
        "Asia/Kolkata"
      )
    ).toEqual([
      { date: "2026-10-11", elapsedMs: 900000 },
      { date: "2026-10-12", elapsedMs: 900000 },
    ])
  })
  it.each([
    ["2026-03-08T04:30Z", "2026-03-09T04:30Z", "2026-03-08", 23],
    ["2026-11-01T03:30Z", "2026-11-02T05:30Z", "2026-11-01", 25],
  ])("handles DST midnight boundaries from %s", (from, to, date, hours) => {
    const result = splitWorkByDate(
      [{ start: Date.parse(from as string), end: Date.parse(to as string) }],
      "America/New_York"
    )
    expect(result[1]).toEqual({ date, elapsedMs: Number(hours) * 3600000 })
    expect(result.reduce((sum, part) => sum + part.elapsedMs, 0)).toBe(
      Date.parse(to as string) - Date.parse(from as string)
    )
  })
})
