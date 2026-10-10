"use client"

import {
  CalendarIcon,
  FolderIcon,
  ListChecksIcon,
  LinkIcon,
} from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { useUpdateTask } from "@/hooks/queries/tasks"
import { formatDate } from "@/lib/format"
import { checklistProgress, type TaskDto } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

import { PriorityDot } from "./task-priority"
import { TaskItemMenu } from "./task-item-menu"

function isOverdue(task: TaskDto) {
  if (task.status === "done") return false
  const due = task.dueAt ?? task.dueDate
  if (!due) return false
  return new Date(due).getTime() < Date.now()
}

export function TaskMeta({
  task,
  className,
}: {
  task: TaskDto
  className?: string
}) {
  const due = task.dueAt ?? task.dueDate
  const { done, total } = checklistProgress(task.checklist)
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5 text-xs text-subtle",
        className
      )}
    >
      <PriorityDot priority={task.priority} />
      {due ? (
        <span
          className={cn(
            "flex items-center gap-1",
            isOverdue(task) && "text-destructive"
          )}
        >
          <CalendarIcon className="size-3" />
          {formatDate(due)}
        </span>
      ) : null}
      {total ? (
        <span className="flex items-center gap-1">
          <ListChecksIcon className="size-3" />
          {done}/{total}
        </span>
      ) : null}
      {task.resources.length ? (
        <span className="flex items-center gap-1">
          <LinkIcon className="size-3" />
          {task.resources.length}
        </span>
      ) : null}
      {task.project ? (
        <span className="flex items-center gap-1 truncate">
          <FolderIcon
            className="size-3"
            style={{ color: task.project.color ?? undefined }}
          />
          <span className="truncate">{task.project.name}</span>
        </span>
      ) : null}
    </div>
  )
}

/** Compact row: inline-toggle checkbox, title, priority/due/checklist/resource/project meta. */
export function TaskRow({
  task,
  onOpen,
  className,
  selectable,
  selected,
  onToggleSelect,
}: {
  task: TaskDto
  onOpen: (id: string) => void
  className?: string
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const update = useUpdateTask()
  const done = task.status === "done"

  return (
    <TaskItemMenu
      task={task}
      onOpen={onOpen}
      trigger={
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-interactive]")) return
            if (selectable) onToggleSelect?.(task.id)
            else onOpen(task.id)
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return
            if (e.key === "Enter") {
              if (selectable) onToggleSelect?.(task.id)
              else onOpen(task.id)
            }
            if (e.key.toLowerCase() === "x" && !selectable) {
              e.preventDefault()
              update.mutate({
                id: task.id,
                patch: { status: done ? "todo" : "done" },
              })
            }
          }}
          className={cn(
            "group flex items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:bg-brand-soft",
            selected && "bg-brand-soft",
            className
          )}
        />
      }
    >
      <span data-interactive>
        {selectable ? (
          <Checkbox
            checked={!!selected}
            onCheckedChange={() => onToggleSelect?.(task.id)}
            aria-label={selected ? "Deselect" : "Select"}
          />
        ) : (
          <Checkbox
            checked={done}
            onCheckedChange={(checked) =>
              update.mutate({
                id: task.id,
                patch: { status: checked ? "done" : "todo" },
              })
            }
            aria-label={done ? "Mark as not done" : "Mark as done"}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            done && "text-text-muted line-through"
          )}
        >
          {task.title}
        </p>
        <TaskMeta task={task} className="mt-0.5" />
      </div>
    </TaskItemMenu>
  )
}
