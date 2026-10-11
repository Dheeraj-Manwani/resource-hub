import type { Habit } from "./model"
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value)
  // Spreadsheet cells supplied as text must not become formulas.
  if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text))
    text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function habitsCsv(items: Habit[]) {
  const rows: unknown[][] = [
    [
      "habit_id",
      "habit_name",
      "status",
      "entry_id",
      "date",
      "kind",
      "amount",
      "unit",
      "period_start",
      "period_end",
      "source",
      "working_minutes",
      "note",
      "timezone",
      "deleted",
    ],
  ]
  for (const habit of items) {
    if (!habit.logs.length)
      rows.push([
        habit.id,
        habit.name,
        habit.status,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        habit.reason,
        "",
        "",
      ])
    for (const log of habit.logs) {
      const config = habit.versions.find((v) => v.id === log.versionId)?.config
      rows.push([
        habit.id,
        habit.name,
        habit.status,
        log.id,
        log.date,
        log.kind,
        log.amount,
        config?.goalType === "minutes"
          ? "minutes"
          : config?.goalType === "done"
            ? "done"
            : (config?.unit ?? ""),
        log.periodStart,
        log.periodEnd,
        log.source ?? "manual",
        log.source === "timer"
          ? (log.elapsedMs ?? 0) / 60000
          : log.kind === "progress" && config?.goalType === "minutes"
            ? log.amount
            : "",
        log.notes,
        log.timezone ?? "",
        log.deleted,
      ])
    }
  }
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  )
}
