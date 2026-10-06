"use client"

import { RepeatIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  buildRrule,
  describeRrule,
  type RecurrenceFreq,
} from "@/lib/tasks/recurrence"
import { cn } from "@/lib/utils"

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]

function RecurrenceBuilder({
  onSave,
  saving,
}: {
  onSave: (rrule: string) => void
  saving: boolean
}) {
  const [freq, setFreq] = useState<RecurrenceFreq>("weekly")
  const [interval, setInterval] = useState(1)
  const [byweekday, setByweekday] = useState<number[]>([])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        Every
        <Input
          type="number"
          min={1}
          max={365}
          value={interval}
          onChange={(e) =>
            setInterval(Math.max(1, Number(e.target.value) || 1))
          }
          className="h-7 w-14 px-1.5 text-center"
        />
        <Select
          value={freq}
          onValueChange={(v: string | null) =>
            v && setFreq(v as RecurrenceFreq)
          }
        >
          <SelectTrigger size="sm">
            <SelectValue>
              {(v: string) => (interval > 1 ? `${v}s` : v)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">day</SelectItem>
            <SelectItem value="weekly">week</SelectItem>
            <SelectItem value="monthly">month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {freq === "weekly" ? (
        <ToggleGroup
          value={byweekday.map(String)}
          onValueChange={(v: string[]) => setByweekday(v.map(Number))}
          variant="outline"
          size="sm"
          spacing={0}
        >
          {WEEKDAY_LABELS.map((label, i) => (
            <ToggleGroupItem
              key={i}
              value={String(i)}
              aria-label={label}
              className="w-7"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}

      <Button
        size="sm"
        className="w-full"
        loading={saving}
        onClick={() => {
          onSave(
            buildRrule({
              freq,
              interval,
              byweekday: byweekday.length ? byweekday : undefined,
            })
          )
        }}
      >
        Save
      </Button>
    </div>
  )
}

/** "Does not repeat" by default; opens a compact freq/interval/weekday
 * builder, or shows a plain-English summary + remove button once set. Only
 * meaningful on a standalone task or a series master — a detached
 * occurrence (`seriesId` set) never carries its own `rrule`. */
export function RecurrenceField({
  rrule,
  onChange,
}: {
  rrule: string | null
  onChange: (rrule: string | null) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  async function save(next: string | null) {
    if (saving) return
    setSaving(true)
    try {
      await onChange(next)
      setOpen(false)
    } catch {
      // The mutation reports the error; keep the builder open for retry.
    } finally {
      setSaving(false)
    }
  }

  if (rrule && !open) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm"
          )}
        >
          <RepeatIcon className="size-3.5 text-brand" />
          {describeRrule(rrule)}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Stop repeating"
          loading={saving}
          onClick={() => void save(null)}
        >
          <XIcon />
        </Button>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={(next) => !saving && setOpen(next)}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            loading={saving}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2.5 py-1.5 text-sm text-subtle hover:border-brand/50 hover:text-brand"
          />
        }
      >
        <RepeatIcon className="size-3.5" />
        Does not repeat
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <RecurrenceBuilder onSave={(next) => void save(next)} saving={saving} />
      </PopoverContent>
    </Popover>
  )
}
