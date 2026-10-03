"use client"

import { Loader2Icon, Trash2Icon, XIcon } from "lucide-react"

import { ProjectSinglePicker } from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import { useBulkTaskActions } from "@/hooks/queries/tasks"
import { TASK_PRIORITIES, TASK_STATUSES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/tasks/types"

import { PriorityDot } from "./task-priority"
import { StatusIcon } from "./task-status"

export function TaskBulkActionBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[]
  onClear: () => void
}) {
  const bulk = useBulkTaskActions()
  if (!selectedIds.length) return null

  return (
    <div className="pointer-events-none sticky bottom-4 z-20 mt-4 flex justify-center">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-surface-raised/95 px-3 py-1.5 shadow-popover backdrop-blur-md">
        <span className="px-2 text-sm font-medium">{selectedIds.length} selected</span>

        <div className="flex items-center gap-1">
          {TASK_STATUSES.map((status) => (
            <Button
              key={status}
              size="icon-sm"
              variant="ghost"
              aria-label={TASK_STATUS_LABELS[status]}
              title={TASK_STATUS_LABELS[status]}
              onClick={() => bulk.mutate({ action: "status", taskIds: selectedIds, status })}
            >
              <StatusIcon status={status} />
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {TASK_PRIORITIES.map((priority) => (
            <Button
              key={priority}
              size="icon-sm"
              variant="ghost"
              aria-label={TASK_PRIORITY_LABELS[priority]}
              title={TASK_PRIORITY_LABELS[priority]}
              onClick={() => bulk.mutate({ action: "priority", taskIds: selectedIds, priority })}
            >
              <PriorityDot priority={priority} />
            </Button>
          ))}
        </div>

        <ProjectSinglePicker
          value={null}
          onChange={(projectId) => bulk.mutate({ action: "project", taskIds: selectedIds, projectId })}
          render={<Button size="sm" variant="ghost" />}
        >
          Move to project
        </ProjectSinglePicker>

        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          disabled={bulk.isPending}
          onClick={() => {
            bulk.mutate({ action: "delete", taskIds: selectedIds })
            onClear()
          }}
        >
          {bulk.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
          Delete
        </Button>

        <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={onClear}>
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
