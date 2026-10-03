import type { TaskStatus } from "./types"

export type IcsTask = {
  id: string
  title: string
  status: TaskStatus
  startAt: Date | null
  dueAt: Date | null
  startDate: string | null
  dueDate: string | null
  allDay: boolean
  rrule: string | null
  exdates: Date[] | null
  seriesId: string | null
  originalOccurrenceAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines over 75 octets are folded with a leading space.
  if (line.length <= 75) return line
  const chunks: string[] = []
  let rest = line
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75))
    rest = rest.slice(75)
  }
  chunks.push(rest)
  return chunks.join("\r\n ")
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function formatDateOnly(value: string): string {
  return value.replace(/-/g, "")
}

/** Builds an RFC 5545 VCALENDAR. Recurring masters keep their own RRULE (and
 * EXDATE) so calendar clients expand them natively; a detached occurrence
 * (edited or completed) becomes its own VEVENT with RECURRENCE-ID so it
 * overrides the master's instance at that date instead of duplicating it. */
export function buildIcs(tasks: IcsTask[], calendarName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//resource-hub//tasks//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  for (const task of tasks) {
    const uid = task.seriesId ? `${task.seriesId}@resource-hub` : `${task.id}@resource-hub`
    lines.push("BEGIN:VEVENT", `UID:${uid}`)
    if (task.seriesId && task.originalOccurrenceAt) {
      lines.push(
        task.allDay
          ? `RECURRENCE-ID;VALUE=DATE:${formatDateOnly(task.startDate ?? task.dueDate ?? "")}`
          : `RECURRENCE-ID:${formatUtc(task.originalOccurrenceAt)}`
      )
    }
    if (task.allDay) {
      const date = task.dueDate ?? task.startDate
      if (date) lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(date)}`)
    } else if (task.startAt) {
      lines.push(`DTSTART:${formatUtc(task.startAt)}`)
      if (task.dueAt) lines.push(`DTEND:${formatUtc(task.dueAt)}`)
    } else if (task.dueAt) {
      lines.push(`DTSTART:${formatUtc(task.dueAt)}`)
    }
    if (task.rrule) lines.push(foldLine(`RRULE:${task.rrule}`))
    if (task.exdates?.length) {
      const values = task.exdates.map((d) => formatUtc(d)).join(",")
      lines.push(foldLine(`EXDATE:${values}`))
    }
    lines.push(foldLine(`SUMMARY:${escapeText(task.title)}`))
    lines.push(`STATUS:${task.status === "done" ? "COMPLETED" : "CONFIRMED"}`)
    lines.push(`DTSTAMP:${formatUtc(task.updatedAt)}`)
    lines.push(`CREATED:${formatUtc(task.createdAt)}`)
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return lines.join("\r\n") + "\r\n"
}
