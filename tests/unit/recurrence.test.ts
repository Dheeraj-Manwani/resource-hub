import { describe, expect, it } from "vitest"

import {
  buildRrule,
  describeRrule,
  expandOccurrences,
  parseRecurrencePhrase,
  withUntil,
} from "@/lib/tasks/recurrence"

describe("buildRrule / expandOccurrences", () => {
  it("expands a weekly Mon/Wed/Fri series within a range", () => {
    const dtstart = new Date("2026-10-05T17:00:00.000Z") // a Monday
    const rrule = buildRrule({ freq: "weekly", byweekday: [1, 3, 5] })
    const occurrences = expandOccurrences(
      rrule,
      dtstart,
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-10-20T00:00:00.000Z")
    )
    expect(occurrences.map((d) => d.toISOString())).toEqual([
      "2026-10-05T17:00:00.000Z",
      "2026-10-07T17:00:00.000Z",
      "2026-10-09T17:00:00.000Z",
      "2026-10-12T17:00:00.000Z",
      "2026-10-14T17:00:00.000Z",
      "2026-10-16T17:00:00.000Z",
      "2026-10-19T17:00:00.000Z",
    ])
  })

  it("excludes exdates from the expansion", () => {
    const dtstart = new Date("2026-10-05T17:00:00.000Z")
    const rrule = buildRrule({ freq: "daily" })
    const occurrences = expandOccurrences(
      rrule,
      dtstart,
      new Date("2026-10-05T00:00:00.000Z"),
      new Date("2026-10-09T18:00:00.000Z"),
      [new Date("2026-10-07T17:00:00.000Z")]
    )
    expect(occurrences.map((d) => d.toISOString())).toEqual([
      "2026-10-05T17:00:00.000Z",
      "2026-10-06T17:00:00.000Z",
      "2026-10-08T17:00:00.000Z",
      "2026-10-09T17:00:00.000Z",
    ])
  })

  it("respects an interval of 2 (every other week)", () => {
    const dtstart = new Date("2026-10-05T17:00:00.000Z")
    const rrule = buildRrule({ freq: "weekly", interval: 2 })
    const occurrences = expandOccurrences(
      rrule,
      dtstart,
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-11-01T00:00:00.000Z")
    )
    expect(occurrences.map((d) => d.toISOString())).toEqual([
      "2026-10-05T17:00:00.000Z",
      "2026-10-19T17:00:00.000Z",
    ])
  })
})

describe("withUntil", () => {
  it("truncates a daily series after the given instant", () => {
    const dtstart = new Date("2026-10-05T17:00:00.000Z")
    const rrule = buildRrule({ freq: "daily" })
    const truncated = withUntil(rrule, dtstart, new Date("2026-10-07T17:00:00.000Z"))
    const occurrences = expandOccurrences(
      truncated,
      dtstart,
      dtstart,
      new Date("2026-10-20T00:00:00.000Z")
    )
    expect(occurrences.map((d) => d.toISOString())).toEqual([
      "2026-10-05T17:00:00.000Z",
      "2026-10-06T17:00:00.000Z",
      "2026-10-07T17:00:00.000Z",
    ])
  })
})

describe("describeRrule", () => {
  it("describes a weekly series in plain English", () => {
    expect(describeRrule(buildRrule({ freq: "weekly", byweekday: [1, 3, 5] }))).toContain("week")
  })
})

describe("parseRecurrencePhrase", () => {
  it("recognizes 'every day'", () => {
    const r = parseRecurrencePhrase("water the plants every day")
    expect(r).not.toBeNull()
    expect(r!.raw.toLowerCase()).toBe("every day")
  })

  it("recognizes 'every weekday' as Mon-Fri", () => {
    const r = parseRecurrencePhrase("standup every weekday")
    expect(r).not.toBeNull()
    const dtstart = new Date("2026-10-05T09:00:00.000Z") // Monday
    const occurrences = expandOccurrences(r!.rrule, dtstart, dtstart, new Date("2026-10-12T00:00:00.000Z"))
    expect(occurrences).toHaveLength(5)
  })

  it("recognizes a named weekday ('every monday')", () => {
    const r = parseRecurrencePhrase("standup every monday")
    expect(r).not.toBeNull()
    const dtstart = new Date("2026-10-05T09:00:00.000Z") // Monday
    // Mondays at 09:00: 10-05, 10-12, 10-19 fall within this range.
    const occurrences = expandOccurrences(r!.rrule, dtstart, dtstart, new Date("2026-10-20T00:00:00.000Z"))
    expect(occurrences).toHaveLength(3)
  })

  it("returns null when there's no recurrence phrase", () => {
    expect(parseRecurrencePhrase("just a plain task")).toBeNull()
  })
})
