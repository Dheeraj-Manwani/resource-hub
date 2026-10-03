const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
})
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date)
}

export function formatRelative(
  value: string | Date | null | undefined,
  now = Date.now()
) {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  const diff = (date.getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return "just now"
  if (abs < 3600) return relative.format(Math.round(diff / 60), "minute")
  if (abs < 86400) return relative.format(Math.round(diff / 3600), "hour")
  if (abs < 86400 * 30) return relative.format(Math.round(diff / 86400), "day")
  return formatDate(date)
}

export function compactNumber(value: number | undefined | null) {
  return value == null ? "" : compact.format(value)
}
