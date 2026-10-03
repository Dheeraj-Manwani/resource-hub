"use client"

import { Draggable } from "@fullcalendar/interaction"
import { useEffect, useMemo, useRef } from "react"

import { PriorityDot } from "@/components/tasks/task-priority"
import { useTaskList } from "@/hooks/queries/tasks"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import type { TaskDto } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

function Section({
  title,
  items,
  onOpen,
}: {
  title: string
  items: TaskDto[]
  onOpen: (id: string) => void
}) {
  return (
    <div>
      <h3 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-subtle uppercase">
        {title} <span className="font-normal text-subtle/70">{items.length}</span>
      </h3>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((t) => (
            <li
              key={t.id}
              data-task-id={t.id}
              data-title={t.title}
              onClick={() => onOpen(t.id)}
              className="calendar-draggable-task flex cursor-grab items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm hover:border-border-strong"
            >
              <PriorityDot priority={t.priority} />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-xs text-subtle">Nothing here.</p>
      )}
    </div>
  )
}

/** Overdue + Unscheduled task lists; each row is externally draggable onto
 * the calendar (via `@fullcalendar/interaction`'s `Draggable`) to schedule
 * it — dropping fires `CalendarView`'s `drop` handler, which turns the drop
 * into a real due-date update rather than a native FC event. */
export function CalendarSidePanel({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { openTask } = useDetailDrawer()
  const overdue = useTaskList({ smartFilter: "overdue", sort: "due", order: "asc" })
  const unscheduled = useTaskList({ smartFilter: "no_date", sort: "sortKey", order: "asc" })

  const overdueItems = useMemo(() => overdue.data?.pages.flatMap((p) => p.items) ?? [], [overdue.data])
  const unscheduledItems = useMemo(
    () => unscheduled.data?.pages.flatMap((p) => p.items) ?? [],
    [unscheduled.data]
  )

  useEffect(() => {
    if (!containerRef.current) return
    const draggable = new Draggable(containerRef.current, {
      itemSelector: ".calendar-draggable-task",
      eventData: (el) => ({
        title: el.dataset.title,
        id: el.dataset.taskId,
        create: false,
      }),
    })
    return () => draggable.destroy()
  }, [])

  return (
    <div ref={containerRef} className={cn("w-64 shrink-0 space-y-5", className)}>
      <Section title="Overdue" items={overdueItems} onOpen={openTask} />
      <Section title="Unscheduled" items={unscheduledItems} onOpen={openTask} />
    </div>
  )
}
