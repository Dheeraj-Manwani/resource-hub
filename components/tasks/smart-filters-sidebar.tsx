"use client"

import {
  CalendarClockIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { useSmartFilterCounts } from "@/hooks/queries/tasks"
import type { SmartFilter } from "@/lib/validation/tasks"
import { cn } from "@/lib/utils"

const FILTERS: { key: SmartFilter; label: string; icon: LucideIcon }[] = [
  { key: "today", label: "Today", icon: CalendarIcon },
  { key: "upcoming", label: "Upcoming", icon: CalendarClockIcon },
  { key: "overdue", label: "Overdue", icon: TriangleAlertIcon },
  { key: "no_date", label: "No date", icon: CircleDashedIcon },
  { key: "completed", label: "Completed", icon: CheckCircle2Icon },
]

/** Sidebar "Tasks" smart-filter rows (Today/Upcoming/Overdue/No date/Completed)
 * with live counts, next to the Projects tree. */
export function TasksSmartFiltersSection() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeFilter = searchParams.get("smartFilter")
  const { data: counts } = useSmartFilterCounts()

  if (!pathname.startsWith("/tasks")) return null

  return (
    <div className="mt-6 px-2">
      <div className="px-3 pb-1">
        <span className="text-[11px] font-medium tracking-wider text-subtle uppercase">
          Smart filters
        </span>
      </div>
      <ul className="space-y-0.5">
        {FILTERS.map(({ key, label, icon: Icon }) => {
          const active = activeFilter === key
          const count = counts?.[key]
          return (
            <li key={key}>
              <Link
                href={`/tasks?smartFilter=${key}`}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-lg px-3 text-sm text-text-muted hover:bg-white/[0.04] hover:text-foreground",
                  active && "bg-brand-soft text-foreground"
                )}
              >
                <Icon className={cn("size-3.5 shrink-0", active ? "text-brand" : "text-subtle")} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {count ? (
                  <span className="shrink-0 text-xs text-subtle tabular-nums">{count}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
