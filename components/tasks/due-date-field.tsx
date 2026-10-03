"use client"

import { CalendarIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export type DueDateValue = {
  dueAt: string | null
  dueDate: string | null
  allDay: boolean
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** All-day toggle + either a plain date or a datetime-local input, matching
 * the schema's `dueAt` (timed, timestamptz) vs `dueDate` (all-day) split. */
export function DueDateField({
  value,
  onChange,
  className,
}: {
  value: DueDateValue
  onChange: (value: DueDateValue) => void
  className?: string
}) {
  const hasDate = !!(value.dueAt || value.dueDate)

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {hasDate ? (
        value.allDay ? (
          <Input
            type="date"
            value={value.dueDate ?? ""}
            onChange={(e) => onChange({ dueDate: e.target.value || null, dueAt: null, allDay: true })}
            className="w-auto"
          />
        ) : (
          <Input
            type="datetime-local"
            value={value.dueAt ? toLocalInputValue(value.dueAt) : ""}
            onChange={(e) =>
              onChange({
                dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                dueDate: null,
                allDay: false,
              })
            }
            className="w-auto"
          />
        )
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const today = new Date()
            onChange({
              dueDate: today.toISOString().slice(0, 10),
              dueAt: null,
              allDay: true,
            })
          }}
        >
          <CalendarIcon />
          Set due date
        </Button>
      )}

      {hasDate ? (
        <>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <Switch
              size="sm"
              checked={value.allDay}
              onCheckedChange={(allDay) => {
                if (allDay) {
                  const date = value.dueAt ? value.dueAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
                  onChange({ dueDate: date, dueAt: null, allDay: true })
                } else {
                  const base = value.dueDate ? new Date(`${value.dueDate}T17:00:00`) : new Date()
                  onChange({ dueAt: base.toISOString(), dueDate: null, allDay: false })
                }
              }}
            />
            All day
          </label>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Clear due date"
            onClick={() => onChange({ dueAt: null, dueDate: null, allDay: false })}
          >
            <XIcon />
          </Button>
        </>
      ) : null}
    </div>
  )
}
