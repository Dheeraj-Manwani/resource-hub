"use client"

import {
  BanIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotDashedIcon,
  type LucideIcon,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

const STATUS_ICON: Record<TaskStatus, LucideIcon> = {
  todo: CircleDashedIcon,
  in_progress: CircleDotDashedIcon,
  blocked: BanIcon,
  done: CheckCircle2Icon,
}

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: "text-subtle",
  in_progress: "text-sky-400",
  blocked: "text-destructive",
  done: "text-emerald-400",
}

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return <Icon className={cn(STATUS_CLASS[status], className)} />
}

export function StatusLabel({ status }: { status: TaskStatus }) {
  return (
    <span className="flex items-center gap-1.5">
      <StatusIcon status={status} className="size-3.5" />
      {TASK_STATUS_LABELS[status]}
    </span>
  )
}

export function StatusSelect({
  value,
  onChange,
  className,
}: {
  value: TaskStatus
  onChange: (value: TaskStatus) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskStatus)}>
      <SelectTrigger size="sm" aria-label="Status" className={className}>
        <SelectValue>{() => <StatusLabel status={value} />}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <StatusLabel status={s} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
