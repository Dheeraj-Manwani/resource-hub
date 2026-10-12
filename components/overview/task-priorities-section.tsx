"use client"

import { overviewSectionLimit } from "@/lib/overview/sections"

import { CheckCheckIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react"
import { TaskItemMenu } from "@/components/tasks/task-item-menu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useUpdateTask } from "@/hooks/queries/tasks"
import { useCompleteOccurrence } from "@/hooks/queries/calendar"
import type { FocusTask, OverviewSummary } from "@/lib/overview/model"
import { TASK_PRIORITY_LABELS } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"
import type { OverviewSectionProps } from "./section-context"
import { dueLabel, pathFor, SectionHeader, PageLink } from "./section-ui"

function FocusTaskRow({
  row,
  data,
  onOpen,
}: {
  row: FocusTask
  data: OverviewSummary
  onOpen: (id: string) => void
}) {
  const update = useUpdateTask()
  const occurrence = useCompleteOccurrence()
  const busy = update.isPending || occurrence.isPending
  const due = dueLabel(row, data)
  const checklistDone = row.task.checklist.filter((item) => item.done).length
  const content = (
    <>
      <div className="relative mt-3 shrink-0">
        {busy ? (
          <Loader2Icon
            className="size-4 animate-spin text-brand"
            aria-label="Completing task"
          />
        ) : (
          <Checkbox
            className="after:-inset-3.5"
            aria-label={`Complete ${row.title}`}
            checked={false}
            disabled={busy}
            onCheckedChange={(checked) => {
              if (!checked) return
              if (row.occurrenceAt)
                occurrence.complete(row.taskId, row.occurrenceAt)
              else update.mutate({ id: row.taskId, patch: { status: "done" } })
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(row.taskId)}
          className="min-h-11 w-full text-left text-sm font-medium break-words hover:text-brand"
        >
          {row.title}
        </button>
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-subtle">
          <span>{pathFor(data, row.projectId)}</span>
          {(row.priority === "urgent" || row.priority === "high") && (
            <span>· {TASK_PRIORITY_LABELS[row.priority]} priority</span>
          )}
          {row.task.checklist.length > 0 && (
            <span>
              · {checklistDone}/{row.task.checklist.length} checklist items
            </span>
          )}
          {row.task.resources.length > 0 && (
            <span>· {row.task.resources.length} linked resources</span>
          )}
          {row.occurrenceAt && <span>· Repeating task</span>}
        </p>
        <p
          className={cn(
            "mt-1 text-xs lg:hidden",
            due.overdue ? "text-destructive" : "text-subtle"
          )}
        >
          {due.label}
        </p>
      </div>
      <span
        className={cn(
          "mt-3 hidden max-w-36 shrink-0 text-right text-xs lg:block",
          due.overdue ? "text-destructive" : "text-subtle"
        )}
      >
        {due.label}
      </span>
    </>
  )
  const className = "relative flex gap-3 border-b border-border py-2.5 pr-8"
  // Whole-task context-menu actions are inappropriate for a single occurrence.
  return row.occurrenceAt ? (
    <div className={className}>{content}</div>
  ) : (
    <TaskItemMenu
      task={row.task}
      onOpen={onOpen}
      trigger={<div className={className} />}
      buttonClassName="absolute top-3 right-0"
    >
      {content}
    </TaskItemMenu>
  )
}

export function TaskPrioritiesSection({
  data,
  actions,
  options,
}: OverviewSectionProps) {
  const limit = overviewSectionLimit("task-priorities", options)
  const { tasks } = data
  const { openTask, openAddTask } = actions
  return (
    <section aria-label="Task priorities">
      <SectionHeader title="What needs doing">
        <PageLink href="/tasks">All tasks</PageLink>
      </SectionHeader>
      <Tabs
        key={options.initialHorizon ?? "today"}
        defaultValue={options.initialHorizon ?? "today"}
      >
        <TabsList variant="line" className="h-11 border-b border-border">
          <TabsTrigger value="today" className="min-h-11">
            Today{" "}
            <span className="ml-1 text-xs text-subtle">{tasks.todayCount}</span>
          </TabsTrigger>
          <TabsTrigger value="week" className="min-h-11">
            Next 7 days
          </TabsTrigger>
        </TabsList>
        {(["today", "week"] as const).map((horizon) => (
          <TabsContent key={horizon} value={horizon}>
            {tasks[horizon].length ? (
              tasks[horizon]
                .slice(0, limit)
                .map((row) => (
                  <FocusTaskRow
                    key={row.key}
                    row={row}
                    data={data}
                    onOpen={openTask}
                  />
                ))
            ) : (
              <div className="border-b border-border py-6">
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2Icon className="size-4 text-subtle" />
                  {horizon === "today"
                    ? "No actionable tasks due today."
                    : "No actionable tasks due in the next 7 days."}
                </p>
                {tasks.suggested.length > 0 ? (
                  <>
                    <p className="mt-3 text-xs text-subtle">
                      Tasks you can choose to work on
                    </p>
                    {tasks.suggested.slice(0, limit).map((row) => (
                      <FocusTaskRow
                        key={row.key}
                        row={row}
                        data={data}
                        onOpen={openTask}
                      />
                    ))}
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    className="mt-2 min-h-11"
                    onClick={() => openAddTask()}
                  >
                    Plan a task
                  </Button>
                )}
              </div>
            )}
            {(horizon === "today" ? tasks.todayCount : tasks.weekCount) >
              Math.min(limit, tasks[horizon].length) && (
              <PageLink href="/tasks">View all tasks</PageLink>
            )}
          </TabsContent>
        ))}
      </Tabs>
      <p
        className="mt-3 flex items-center gap-2 text-xs text-subtle"
        aria-live="polite"
      >
        <CheckCheckIcon className="size-4" />
        {tasks.completedToday} completed today
      </p>
    </section>
  )
}
