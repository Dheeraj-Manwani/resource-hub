import { describe, expect, it } from "vitest"

import { parseQuickAdd } from "@/lib/tasks/quick-add"

// A fixed Saturday so "friday" and "tomorrow" resolve deterministically.
const REF = new Date("2026-10-03T12:00:00Z")

describe("parseQuickAdd", () => {
  it("parses the plan's canonical example", () => {
    const r = parseQuickAdd(
      "finish landing page friday 5pm #projectname !high",
      REF
    )
    expect(r.title).toBe("finish landing page")
    expect(r.priority).toBe("high")
    expect(r.projectQuery).toBe("projectname")
    expect(r.allDay).toBe(false)
    expect(r.dueAt).not.toBeNull()
    expect(r.dueAt?.toISOString()).toBe("2026-10-09T11:30:00.000Z")
  })

  it("recognizes +tag and numeric !priority aliases", () => {
    const r = parseQuickAdd("write the report +writing +deepwork !2", REF)
    expect(r.title).toBe("write the report")
    expect(r.tags).toEqual(["writing", "deepwork"])
    expect(r.priority).toBe("medium")
  })

  it("supports #parent/child nested project paths", () => {
    const r = parseQuickAdd("ship the release #work/launch !urgent", REF)
    expect(r.title).toBe("ship the release")
    expect(r.projectQuery).toBe("work/launch")
    expect(r.priority).toBe("urgent")
  })

  it("treats a dateless phrase like 'tomorrow' as all-day", () => {
    const r = parseQuickAdd("water the plants tomorrow", REF)
    expect(r.title).toBe("water the plants")
    expect(r.allDay).toBe(true)
    expect(r.dueAt).toBeNull()
    expect(r.dueDate).toBe("2026-10-04")
  })

  it("supports a timed range ('next mon 9-10am') as start + due", () => {
    const r = parseQuickAdd("team sync next mon 9-10am", REF)
    expect(r.title).toBe("team sync")
    expect(r.allDay).toBe(false)
    expect(r.startAt).not.toBeNull()
    expect(r.dueAt).not.toBeNull()
    expect(r.startAt?.getTime()).toBeLessThan(r.dueAt!.getTime())
  })

  it("leaves a plain title with no tokens untouched", () => {
    const r = parseQuickAdd("just a plain task", REF)
    expect(r.title).toBe("just a plain task")
    expect(r.priority).toBeNull()
    expect(r.tags).toEqual([])
    expect(r.projectQuery).toBeNull()
    expect(r.dueAt).toBeNull()
    expect(r.dueDate).toBeNull()
  })

  it("ignores an unknown !token instead of stripping it", () => {
    const r = parseQuickAdd("call it !important", REF)
    expect(r.title).toBe("call it !important")
    expect(r.priority).toBeNull()
  })

  it("recognizes a recurrence phrase without it being swallowed by chrono", () => {
    const r = parseQuickAdd("standup every weekday 9am", REF)
    expect(r.title).toBe("standup")
    expect(r.rrule).not.toBeNull()
    expect(r.allDay).toBe(false)
    expect(r.dueAt).not.toBeNull()
  })

  it("has a null rrule when there's no recurrence phrase", () => {
    const r = parseQuickAdd("finish landing page friday 5pm #projectname !high", REF)
    expect(r.rrule).toBeNull()
  })
})
