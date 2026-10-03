import * as chrono from "chrono-node"

import { parseRecurrencePhrase, toDateOnly } from "./recurrence"
import { type TaskPriority } from "./types"

const PRIORITY_ALIASES: Record<string, TaskPriority> = {
  low: "low",
  "1": "low",
  medium: "medium",
  "2": "medium",
  high: "high",
  "3": "high",
  urgent: "urgent",
  "4": "urgent",
}

export type QuickAddToken =
  | { type: "priority"; raw: string; priority: TaskPriority }
  | { type: "tag"; raw: string; name: string }
  | { type: "project"; raw: string; query: string }
  | { type: "date"; raw: string }
  | { type: "recurrence"; raw: string; rrule: string }

export type QuickAddResult = {
  /** Remaining text once every recognized token is stripped out. */
  title: string
  priority: TaskPriority | null
  tags: string[]
  /** Raw `#project` or `#parent/child` text, resolved against real projects by the caller. */
  projectQuery: string | null
  startAt: Date | null
  dueAt: Date | null
  /** `YYYY-MM-DD`, set instead of `dueAt` when no time of day was given. */
  dueDate: string | null
  allDay: boolean
  /** RRULE value ("every day/weekday/<weekday>/month", "every other week"). */
  rrule: string | null
  /** In input order, for rendering preview chips. */
  tokens: QuickAddToken[]
}

type Span = { start: number; end: number; token: QuickAddToken }

const TAG_RE = /(^|\s)\+([a-zA-Z0-9][\w-]{0,49})/g
const PRIORITY_RE = /(^|\s)!(low|medium|high|urgent|[1-4])\b/gi
const PROJECT_RE = /(^|\s)#([a-zA-Z0-9][\w/-]{0,99})/

/**
 * Parses free-typed task text into a title plus structured tokens:
 * `#project` (fuzzy; `#parent/child` for nested — resolved by the caller
 * against real projects), `!priority` (`!low|medium|high|urgent` or
 * `!1`-`!4`), `+tag`, one recurrence phrase ("every day/weekday/<weekday>/
 * month", "every other week"), and one natural-language date/time span via
 * `chrono-node` (the recurring series' first occurrence time, if given).
 */
export function parseQuickAdd(
  input: string,
  referenceDate: Date = new Date()
): QuickAddResult {
  const spans: Span[] = []

  for (const m of input.matchAll(TAG_RE)) {
    const name = m[2]!
    const start = m.index + m[0].indexOf("+")
    spans.push({
      start,
      end: start + name.length + 1,
      token: { type: "tag", raw: `+${name}`, name },
    })
  }

  for (const m of input.matchAll(PRIORITY_RE)) {
    const word = m[2]!
    const priority = PRIORITY_ALIASES[word.toLowerCase()]
    if (!priority) continue
    const start = m.index + m[0].indexOf("!")
    spans.push({
      start,
      end: start + word.length + 1,
      token: { type: "priority", raw: `!${word}`, priority },
    })
  }

  const projectMatch = PROJECT_RE.exec(input)
  if (projectMatch) {
    const query = projectMatch[2]!
    const start = projectMatch.index + projectMatch[0].indexOf("#")
    spans.push({
      start,
      end: start + query.length + 1,
      token: { type: "project", raw: `#${query}`, query },
    })
  }

  // Extracted before chrono runs: "every monday"/"every weekday" would
  // otherwise be partly misread as a one-off date ("monday", "weekday 9am").
  const recurrence = parseRecurrencePhrase(input)
  if (recurrence) {
    spans.push({
      start: recurrence.index,
      end: recurrence.index + recurrence.raw.length,
      token: { type: "recurrence", raw: recurrence.raw, rrule: recurrence.rrule },
    })
  }

  // Mask claimed spans with equal-length blanks before running chrono, so a
  // token's text can't be misread as part of a date and index math stays
  // aligned with the original string.
  let masked = input
  for (const s of spans) {
    masked = masked.slice(0, s.start) + " ".repeat(s.end - s.start) + masked.slice(s.end)
  }

  const chronoResults = chrono.parse(masked, referenceDate, { forwardDate: true })
  const match = chronoResults[0]
  let startAt: Date | null = null
  let dueAt: Date | null = null
  let allDay = false
  if (match) {
    allDay = !match.start.isCertain("hour")
    const start = match.start.date()
    const end = match.end?.date() ?? null
    startAt = allDay ? null : start
    dueAt = allDay ? null : (end ?? start)
    spans.push({
      start: match.index,
      end: match.index + match.text.length,
      token: { type: "date", raw: match.text },
    })
  }

  let title = input
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    title = title.slice(0, s.start) + " " + title.slice(s.end)
  }
  title = title.replace(/\s+/g, " ").trim()

  spans.sort((a, b) => a.start - b.start)
  const tags = spans
    .filter((s) => s.token.type === "tag")
    .map((s) => (s.token as { name: string }).name)
  const priority =
    (spans.find((s) => s.token.type === "priority")?.token as
      | { priority: TaskPriority }
      | undefined)?.priority ?? null
  const projectQuery =
    (spans.find((s) => s.token.type === "project")?.token as
      | { query: string }
      | undefined)?.query ?? null
  const rrule =
    (spans.find((s) => s.token.type === "recurrence")?.token as
      | { rrule: string }
      | undefined)?.rrule ?? null

  return {
    title,
    priority,
    tags,
    projectQuery,
    startAt,
    dueAt,
    dueDate: match && allDay ? toDateOnly(match.start.date()) : null,
    allDay,
    rrule,
    tokens: spans.map((s) => s.token),
  }
}
