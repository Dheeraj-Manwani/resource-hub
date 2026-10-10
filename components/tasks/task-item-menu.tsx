"use client"

import type { HTMLAttributes, ReactElement, ReactNode } from "react"
import { useState } from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleCheckIcon,
  CircleIcon,
  PencilIcon,
  Trash2Icon,
  CopyIcon,
} from "lucide-react"
import { ItemMenu } from "@/components/ui/item-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  useArchiveTask,
  useDeleteTask,
  useUpdateTask,
  useDuplicateTask,
} from "@/hooks/queries/tasks"
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskDto,
} from "@/lib/tasks/types"
import { StatusIcon } from "./task-status"
import { PriorityDot } from "./task-priority"

export function TaskItemMenu({
  task,
  onOpen,
  trigger,
  children,
  buttonClassName,
}: {
  task: TaskDto
  onOpen: (id: string) => void
  trigger: ReactElement<HTMLAttributes<HTMLElement>>
  children?: ReactNode
  buttonClassName?: string
}) {
  const update = useUpdateTask()
  const archive = useArchiveTask()
  const remove = useDeleteTask()
  const duplicate = useDuplicateTask()
  const [deleting, setDeleting] = useState(false)
  return (
    <>
      <ItemMenu
        trigger={trigger}
        label={`${task.title} options`}
        buttonClassName={buttonClassName}
        actions={
          <>
            <DropdownMenuItem onClick={() => onOpen(task.id)}>
              <PencilIcon />
              Open / edit
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  id: task.id,
                  patch: { status: task.status === "done" ? "todo" : "done" },
                })
              }
            >
              {task.status === "done" ? <CircleIcon /> : <CircleCheckIcon />}
              {task.status === "done" ? "Mark as not done" : "Mark as done"}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <StatusIcon status={task.status} />
                Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {TASK_STATUSES.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    disabled={update.isPending || status === task.status}
                    onClick={() =>
                      update.mutate({ id: task.id, patch: { status } })
                    }
                  >
                    <StatusIcon status={status} />
                    {TASK_STATUS_LABELS[status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PriorityDot priority={task.priority} />
                Priority
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {TASK_PRIORITIES.map((priority) => (
                  <DropdownMenuItem
                    key={priority}
                    disabled={update.isPending || priority === task.priority}
                    onClick={() =>
                      update.mutate({ id: task.id, patch: { priority } })
                    }
                  >
                    <PriorityDot priority={priority} />
                    {TASK_PRIORITY_LABELS[priority]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate(task.id)}
            >
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={archive.isPending}
              onClick={() => archive.mutate(task.id)}
            >
              {task.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {task.archivedAt ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleting(true)}
            >
              <Trash2Icon />
              Move to trash
            </DropdownMenuItem>
          </>
        }
      >
        {children}
      </ItemMenu>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete "${task.title}"?`}
        description="This task will move to Trash. You can restore it later."
        confirmLabel="Move to trash"
        onConfirm={() => remove.mutateAsync(task.id)}
      />
    </>
  )
}
