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
import { todayIn } from "@/lib/habits/model"

export type QuickCreateTarget = { date: Date; allDay: boolean } | null

/** Opened from clicking/dragging an empty calendar slot — the date/time is
 * already fixed by the click, so this is just a title field rather than
 * the full quick-add parser. */
export function QuickCreateDialog({
  target,
  onClose,
  projectId,
  timezone = "UTC",
}: {
  projectId?: string
  timezone?: string
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
        dueDate: target.allDay ? todayIn(timezone, target.date) : null,
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
    <Dialog
      open={!!target}
      onOpenChange={(open) => !open && !create.isPending && onClose()}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {target
              ? `New task — ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: timezone }).format(target.date)}${target.allDay ? "" : ` ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(target.date)}`}`
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
          <Button
            loading={create.isPending}
            onClick={submit}
            disabled={!title.trim() || create.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
