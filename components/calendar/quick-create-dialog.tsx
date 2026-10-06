"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useCreateTask } from "@/hooks/queries/tasks"
import { formatDate } from "@/lib/format"
import { toDateOnly } from "@/lib/tasks/recurrence"

export type QuickCreateTarget = { date: Date; allDay: boolean } | null

const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
})

/** Opened from clicking/dragging an empty calendar slot — the date/time is
 * already fixed by the click, so this is just a title field rather than
 * the full quick-add parser. */
export function QuickCreateDialog({
  target,
  onClose,
  projectId,
}: {
  projectId?: string
  target: QuickCreateTarget
  onClose: () => void
}) {
  const [title, setTitle] = useState("")
  const create = useCreateTask()

  function submit() {
    if (!target || !title.trim() || create.isPending) return
    create.mutate(
      {
        title: title.trim(),
        projectId,
        dueAt: target.allDay ? null : target.date.toISOString(),
        dueDate: target.allDay ? toDateOnly(target.date) : null,
        allDay: target.allDay,
      },
      {
        onSuccess: () => {
          setTitle("")
          onClose()
        },
      }
    )
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {target
              ? `New task — ${formatDate(target.date)}${target.allDay ? "" : ` ${timeFormatter.format(target.date)}`}`
              : "New task"}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Task title"
        />
        <DialogFooter>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
