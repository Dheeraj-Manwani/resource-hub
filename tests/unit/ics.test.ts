import { describe, expect, it } from "vitest"

import { buildIcs, type IcsTask } from "@/lib/tasks/ics"

function task(overrides: Partial<IcsTask>): IcsTask {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Sample task",
    status: "todo",
    startAt: null,
    dueAt: null,
    startDate: null,
    dueDate: null,
    allDay: false,
    rrule: null,
    exdates: null,
    seriesId: null,
    originalOccurrenceAt: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("buildIcs", () => {
  it("produces a valid-shaped VCALENDAR with one VEVENT per task", () => {
    const ics = buildIcs(
      [task({ dueAt: new Date("2026-10-09T17:00:00.000Z") })],
      "My tasks"
    )
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(ics).toContain("VERSION:2.0")
    expect(ics).toContain("BEGIN:VEVENT")
    expect(ics).toContain("SUMMARY:Sample task")
    expect(ics).toContain("DTSTART:20261009T170000Z")
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true)
  })

  it("emits RRULE and EXDATE for a recurring master", () => {
    const ics = buildIcs(
      [
        task({
          dueAt: new Date("2026-10-05T17:00:00.000Z"),
          startAt: new Date("2026-10-05T17:00:00.000Z"),
          rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
          exdates: [new Date("2026-10-07T17:00:00.000Z")],
        }),
      ],
      "My tasks"
    )
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR")
    expect(ics).toContain("EXDATE:20261007T170000Z")
  })

  it("emits RECURRENCE-ID and a shared UID for a detached exception", () => {
    const masterId = "11111111-1111-1111-1111-111111111111"
    const ics = buildIcs(
      [
        task({
          id: "22222222-2222-2222-2222-222222222222",
          seriesId: masterId,
          originalOccurrenceAt: new Date("2026-10-07T17:00:00.000Z"),
          dueAt: new Date("2026-10-07T18:00:00.000Z"),
          status: "done",
        }),
      ],
      "My tasks"
    )
    expect(ics).toContain(`UID:${masterId}@resource-hub`)
    expect(ics).toContain("RECURRENCE-ID:20261007T170000Z")
    expect(ics).toContain("STATUS:COMPLETED")
  })

  it("escapes commas, semicolons and newlines in free text", () => {
    const ics = buildIcs([task({ title: "Buy milk, eggs; and bread\nplease" })], "My tasks")
    expect(ics).toContain("Buy milk\\, eggs\\; and bread\\nplease")
  })

  it("folds lines longer than 75 octets", () => {
    const longTitle = "x".repeat(120)
    const ics = buildIcs([task({ title: longTitle })], "My tasks")
    const summaryLine = ics.split("\r\n").find((l) => l.startsWith("SUMMARY:"))
    expect(summaryLine!.length).toBeLessThanOrEqual(75)
    expect(ics).toContain("\r\n ")
  })
})
