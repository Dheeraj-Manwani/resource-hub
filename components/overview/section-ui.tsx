"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import {
  dateInTimezone,
  isPastDue,
  overviewWindow,
  type FocusTask,
  type OverviewSummary,
} from "@/lib/overview/model"

export const TOUCH_LINK =
  "inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
export const countLabel = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

export function SectionHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </div>
  )
}
export function PageLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <Link href={href} className={TOUCH_LINK}>
      {children}
      <ArrowUpRightIcon className="size-3.5" />
    </Link>
  )
}
export function pathFor(data: OverviewSummary, id: string | null) {
  return id ? (data.projectPaths[id] ?? "Project") : "No project"
}
export function dueLabel(row: FocusTask, data: OverviewSummary) {
  const window = overviewWindow(data.timezone, new Date(data.generatedAt))
  const day =
    row.dueDate ?? (row.dueAt ? dateInTimezone(row.dueAt, data.timezone) : null)
  const overdue = isPastDue(row, window)
  if (!day) return { label: "No due date", overdue: false }
  const dayLabel =
    day === data.todayDate
      ? "Today"
      : new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${day}T12:00:00Z`))
  const time = row.dueAt
    ? new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: data.timezone,
      }).format(new Date(row.dueAt))
    : ""
  return {
    label: `${dayLabel}${time ? `, ${time}` : ""}${overdue ? " · Overdue" : ""}`,
    overdue,
  }
}
