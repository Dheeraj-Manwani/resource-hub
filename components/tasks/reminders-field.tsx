"use client"

import { BellIcon, PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAddReminder, useDeleteReminder } from "@/hooks/queries/reminders"
import type { ReminderDto } from "@/lib/tasks/types"

const PRESETS: { label: string; minutes: number }[] = [
  { label: "At time", minutes: 0 },
  { label: "5 minutes before", minutes: 5 },
  { label: "15 minutes before", minutes: 15 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 60 * 24 },
]

function offsetLabel(minutes: number) {
  const preset = PRESETS.find((p) => p.minutes === minutes)
  if (preset) return preset.label
  if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)}d before`
  if (minutes % 60 === 0) return `${minutes / 60}h before`
  return `${minutes}m before`
}

export function RemindersField({
  taskId,
  reminders,
}: {
  taskId: string
  reminders: ReminderDto[]
}) {
  const add = useAddReminder()
  const remove = useDeleteReminder()
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-1.5">
      {reminders.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
        >
          <BellIcon className="size-3.5 text-subtle" />
          <span className="flex-1">{offsetLabel(r.offsetMinutes)}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Remove reminder"
            loading={remove.isPending && remove.variables?.reminderId === r.id}
            onClick={() => remove.mutate({ taskId, reminderId: r.id })}
          >
            <XIcon />
          </Button>
        </div>
      ))}

      {adding ? (
        <Select
          onValueChange={(v: string | null) => {
            if (v) add.mutate({ taskId, offsetMinutes: Number(v) })
            setAdding(false)
          }}
          onOpenChange={(open) => !open && setAdding(false)}
          defaultOpen
        >
          <SelectTrigger
            size="sm"
            className="w-full"
            aria-label="Reminder offset"
          >
            <SelectValue>{() => "Choose when…"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.minutes} value={String(p.minutes)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button
          variant="outline"
          size="sm"
          loading={add.isPending}
          onClick={() => setAdding(true)}
        >
          <PlusIcon />
          Add reminder
        </Button>
      )}
    </div>
  )
}
