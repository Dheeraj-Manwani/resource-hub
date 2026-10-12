"use client"

import { ArrowRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OverviewSectionProps } from "./section-context"
import { countLabel, dueLabel, pathFor } from "./section-ui"

export function DailyBriefSection({ data, actions }: OverviewSectionProps) {
  const { openTask, openAddTask, reviewResources } = actions
  const { tasks, resources } = data
  const blocked = tasks.blocked[0]
  const focus =
    tasks.today[0] ??
    (blocked ? undefined : (tasks.week[0] ?? tasks.suggested[0]))
  const briefTitle =
    tasks.pastDue > 0
      ? "Clear overdue tasks, then take the next step."
      : tasks.dueToday > 0
        ? "Start with what's due today."
        : blocked
          ? "Unblock a task to keep things moving."
          : focus
            ? "Choose a task and move it forward."
            : resources.toReviewCount > 0
              ? "Revisit something you saved."
              : "Make room for your next idea."
  const briefReason = focus
    ? `${focus.title} · ${pathFor(data, focus.projectId)} · ${dueLabel(focus, data).label}`
    : blocked
      ? `${blocked.title} · Marked blocked`
      : resources.toReviewCount
        ? `${countLabel(resources.toReviewCount, "saved resource")} ${resources.toReviewCount === 1 ? "hasn't" : "haven't"} been marked reviewed.`
        : "Save a resource, plan a task, or start a doc."
  const action = focus
    ? () => openTask(focus.taskId)
    : blocked
      ? () => openTask(blocked.id)
      : resources.toReviewCount
        ? reviewResources
        : () => openAddTask()
  const actionLabel = focus
    ? "Open next task"
    : blocked
      ? "Open blocked task"
      : resources.toReviewCount
        ? "Review resources"
        : "New task"
  return (
    <section
      aria-label="Daily brief"
      className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center"
    >
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium tracking-wide text-brand uppercase">
          Today&apos;s focus
        </p>
        <h2 className="text-base font-medium">{briefTitle}</h2>
        <p className="mt-2 text-sm text-text-muted">{briefReason}</p>
      </div>
      <Button className="min-h-11 shrink-0" onClick={action}>
        {actionLabel}
        <ArrowRightIcon />
      </Button>
    </section>
  )
}
