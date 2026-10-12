"use client"

import { overviewSectionLimit } from "@/lib/overview/sections"

import { CheckCircle2Icon } from "lucide-react"
import { QueryFeedback } from "@/components/query-feedback"
import { TaskItemMenu } from "@/components/tasks/task-item-menu"
import { Button } from "@/components/ui/button"
import { useOverviewSection } from "@/hooks/queries/overview"
import { useUpdateTask } from "@/hooks/queries/tasks"
import { formatRelative } from "@/lib/format"
import type { TaskDto } from "@/lib/tasks/types"
import type { OverviewSectionProps } from "./section-context"
import { PageLink, pathFor, SectionHeader } from "./section-ui"

function CompletedTaskRow({
  task,
  data,
  actions,
}: Pick<OverviewSectionProps, "data" | "actions"> & { task: TaskDto }) {
  const update = useUpdateTask()
  return (
    <TaskItemMenu
      task={task}
      onOpen={actions.openTask}
      trigger={
        <div className="relative flex flex-wrap items-center gap-3 border-b border-border py-3 pr-8" />
      }
      buttonClassName="absolute top-3 right-0"
    >
      <CheckCircle2Icon className="size-4 shrink-0 text-brand" />
      <button
        type="button"
        onClick={() => actions.openTask(task.id)}
        className="min-h-11 min-w-0 flex-1 text-left hover:text-brand"
      >
        <span className="block text-sm font-medium break-words">
          {task.title}
        </span>
        <span className="mt-1 block text-xs text-subtle">
          {pathFor(data, task.projectId)} · Completed{" "}
          {formatRelative(task.completedAt!)}
          {task.originalOccurrenceAt && " · Repeating occurrence"}
        </span>
      </button>
      <Button
        variant="ghost"
        className="min-h-11 text-xs"
        loading={update.isPending}
        aria-label={`Reopen ${task.title}`}
        onClick={() =>
          update.mutate({ id: task.id, patch: { status: "todo" } })
        }
      >
        Reopen
      </Button>
    </TaskItemMenu>
  )
}

export function RecentlyCompletedTasksSection({
  data,
  actions,
  options,
}: OverviewSectionProps) {
  const limit = overviewSectionLimit("recently-completed-tasks", options)
  const query = useOverviewSection("recently-completed-tasks")
  return (
    <section aria-label="Recently completed tasks">
      <SectionHeader title="Recently completed tasks">
        <PageLink href="/tasks?smartFilter=completed">Completed tasks</PageLink>
      </SectionHeader>
      <QueryFeedback query={query} label="recently completed tasks" />
      {query.data &&
        (query.data.items.length ? (
          query.data.items
            .slice(0, limit)
            .map((task) => (
              <CompletedTaskRow
                key={task.id}
                task={task}
                data={data}
                actions={actions}
              />
            ))
        ) : (
          <p className="py-4 text-sm text-text-muted">
            Completed tasks will appear here. Choose a task to work on today.
          </p>
        ))}
    </section>
  )
}
