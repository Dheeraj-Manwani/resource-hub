"use client"

import { useMemo } from "react"

import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskDto,
} from "@/lib/tasks/types"

import { TaskRow } from "./task-card"

export type TaskGroupBy = "none" | "status" | "project" | "due" | "priority"

function dueBucket(task: TaskDto): string {
  const due = task.dueAt ?? task.dueDate
  if (task.status === "done") return "Completed"
  if (!due) return "No date"
  const d = new Date(due)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  if (startOfDay(d) < startOfDay(now)) return "Overdue"
  if (startOfDay(d).getTime() === startOfDay(now).getTime()) return "Today"
  return "Upcoming"
}

const DUE_ORDER = ["Overdue", "Today", "Upcoming", "No date", "Completed"]

function groupTasks(items: TaskDto[], groupBy: TaskGroupBy): { label: string; items: TaskDto[] }[] {
  if (groupBy === "none") return items.length ? [{ label: "", items }] : []

  const buckets = new Map<string, TaskDto[]>()
  for (const task of items) {
    const key =
      groupBy === "status"
        ? TASK_STATUS_LABELS[task.status]
        : groupBy === "priority"
          ? TASK_PRIORITY_LABELS[task.priority]
          : groupBy === "project"
            ? task.project?.name ?? "No project"
            : dueBucket(task)
    const list = buckets.get(key) ?? []
    list.push(task)
    buckets.set(key, list)
  }

  let order: string[]
  if (groupBy === "status") order = TASK_STATUSES.map((s) => TASK_STATUS_LABELS[s])
  else if (groupBy === "priority") order = [...TASK_PRIORITIES].reverse().map((p) => TASK_PRIORITY_LABELS[p])
  else if (groupBy === "due") order = DUE_ORDER
  else order = [...buckets.keys()].sort((a, b) => a.localeCompare(b))

  return order
    .filter((label) => buckets.has(label))
    .map((label) => ({ label, items: buckets.get(label)! }))
}

export function TaskList({
  items,
  groupBy,
  onOpen,
  selectable,
  selected,
  onToggleSelect,
}: {
  items: TaskDto[]
  groupBy: TaskGroupBy
  onOpen: (id: string) => void
  selectable?: boolean
  selected?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const groups = useMemo(() => groupTasks(items, groupBy), [items, groupBy])

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label || "all"}>
          {group.label ? (
            <h3 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-medium tracking-wide text-subtle uppercase">
              {group.label}
              <span className="font-normal text-subtle/70">{group.items.length}</span>
            </h3>
          ) : null}
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {group.items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onOpen={onOpen}
                selectable={selectable}
                selected={selected?.has(task.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
