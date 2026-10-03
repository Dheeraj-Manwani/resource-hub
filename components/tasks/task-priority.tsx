"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskPriority,
} from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

// Full, literal class names so Tailwind's scanner can find them statically.
const DOT_CLASS: Record<TaskPriority, string> = {
  low: "bg-priority-low",
  medium: "bg-priority-medium",
  high: "bg-priority-high",
  urgent: "bg-priority-urgent",
}

export function PriorityDot({
  priority,
  className,
}: {
  priority: TaskPriority
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", DOT_CLASS[priority], className)}
    />
  )
}

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return (
    <span className="flex items-center gap-1.5">
      <PriorityDot priority={priority} />
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  )
}

export function PrioritySelect({
  value,
  onChange,
  className,
}: {
  value: TaskPriority
  onChange: (value: TaskPriority) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskPriority)}>
      <SelectTrigger size="sm" aria-label="Priority" className={className}>
        <SelectValue>{() => <PriorityLabel priority={value} />}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            <PriorityLabel priority={p} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
