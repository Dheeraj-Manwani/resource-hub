// Namespace import, not named — `rrule` is CJS, and Node's native ESM/CJS
// interop (unlike webpack/Turbopack/Vitest) can't always statically detect
// its named exports, instead nesting the real exports under `.default`.
import * as rrulePkg from "rrule"

type RRuleExports = typeof rrulePkg & { default?: typeof rrulePkg }
const { RRule, rrulestr } = (rrulePkg as RRuleExports).default ?? rrulePkg

/**
 * Recurring tasks store only the RRULE *value* (no `DTSTART:` line) in
 * `tasks.rrule` — the anchor date/time is already the task's own
 * `startAt`/`dueAt`/`startDate`/`dueDate`, so this module always takes
 * `dtstart` as a separate argument rather than duplicating it in the string.
 */

export type RecurrenceFreq = "daily" | "weekly" | "monthly"

const FREQ: Record<RecurrenceFreq, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
}

/** JS `Date#getDay()` convention: 0 = Sunday … 6 = Saturday. */
const WEEKDAY = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA]

export type RecurrenceInput = {
  freq: RecurrenceFreq
  interval?: number
  /** 0 = Sunday … 6 = Saturday; only meaningful for `freq: "weekly"`. */
  byweekday?: number[]
  until?: Date | null
}

function stripPrefix(ruleString: string) {
  return ruleString.replace(/^RRULE:/, "")
}

export function toDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/** Parses a plain `YYYY-MM-DD` column value as a UTC midnight instant. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/** Builds the stored RRULE value from the custom-builder UI's inputs. */
export function buildRrule(input: RecurrenceInput): string {
  const rule = new RRule({
    freq: FREQ[input.freq],
    interval: input.interval && input.interval > 1 ? input.interval : undefined,
    byweekday: input.byweekday?.length ? input.byweekday.map((d) => WEEKDAY[d]) : undefined,
    until: input.until ?? null,
  })
  return stripPrefix(rule.toString())
}

/** Truncates a series at `until` (exclusive of later occurrences), for
 * "this and following" edits that end the current series there. */
export function withUntil(rrule: string, dtstart: Date, until: Date): string {
  const rule = rrulestr(rrule, { dtstart })
  const next = new RRule({ ...rule.origOptions, until })
  return stripPrefix(next.toString())
}

/** Human-readable summary ("every weekday", "every 2 weeks on Mon, Wed"). */
export function describeRrule(rrule: string): string {
  try {
    return rrulestr(rrule, { dtstart: new Date() }).toText()
  } catch {
    return "Custom"
  }
}

/** Occurrence instants in `[rangeStart, rangeEnd]` (inclusive), minus any
 * `exdates` (an edited/completed occurrence detaches into its own task row
 * and is excluded here so it isn't shown twice). */
export function expandOccurrences(
  rrule: string,
  dtstart: Date,
  rangeStart: Date,
  rangeEnd: Date,
  exdates: Date[] = []
): Date[] {
  const rule = rrulestr(rrule, { dtstart })
  const excluded = new Set(exdates.map((d) => d.getTime()))
  return rule.between(rangeStart, rangeEnd, true).filter((d) => !excluded.has(d.getTime()))
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

const PHRASES: { re: RegExp; build: (m: RegExpMatchArray) => RecurrenceInput }[] = [
  { re: /\bevery\s+weekday\b/i, build: () => ({ freq: "weekly", byweekday: [1, 2, 3, 4, 5] }) },
  { re: /\bevery\s+day\b/i, build: () => ({ freq: "daily" }) },
  {
    re: new RegExp(`\\bevery\\s+(${WEEKDAY_NAMES.join("|")})\\w*\\b`, "i"),
    build: (m) => ({ freq: "weekly", byweekday: [WEEKDAY_NAMES.indexOf(m[1]!.toLowerCase())] }),
  },
  { re: /\bevery\s+(?:other\s+)?week\b/i, build: (m) => ({ freq: "weekly", interval: /other/i.test(m[0]) ? 2 : 1 }) },
  { re: /\bevery\s+month\b/i, build: () => ({ freq: "monthly" }) },
]

/** Recognizes a trailing recurrence phrase ("every day/weekday/monday/month",
 * "every other week") in quick-add text; returns the built RRULE value and
 * the matched span so the caller can strip it from the title. */
export function parseRecurrencePhrase(
  text: string
): { rrule: string; raw: string; index: number } | null {
  for (const { re, build } of PHRASES) {
    const m = text.match(re)
    if (m && m.index !== undefined) {
      return { rrule: buildRrule(build(m)), raw: m[0], index: m.index }
    }
  }
  return null
}
