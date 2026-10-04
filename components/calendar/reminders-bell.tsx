"use client"

import { BellIcon, BellRingIcon, CheckIcon, ClockIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "react-hot-toast"
import { showToast } from "@/lib/toast"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDismissReminder, useDueReminders } from "@/hooks/queries/reminders"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { formatRelative } from "@/lib/format"
import type { DueReminder } from "@/lib/server/dal/reminders"
import { cn } from "@/lib/utils"

function requestNotificationPermission() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return
  void Notification.requestPermission()
}

function notify(reminder: DueReminder) {
  showToast(reminder.title, {
    description: "Reminder",
    icon: <ClockIcon className="size-4" />,
  })
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(reminder.title, { body: "Task reminder", tag: reminder.reminderId })
  }
}

/** Polls due reminders every 60s + on focus; toasts (and browser-notifies,
 * if permission was granted) the first time each one appears, and lists
 * everything pending in a bell dropdown with dismiss/snooze. */
export function RemindersBell() {
  const { data: due = [] } = useDueReminders()
  const dismiss = useDismissReminder()
  const { openTask } = useDetailDrawer()
  const seen = useRef<Set<string>>(new Set())
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set())

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  useEffect(() => {
    for (const reminder of due) {
      const key = `${reminder.reminderId}:${reminder.occurrenceAt}`
      if (snoozed.has(key)) continue
      if (!seen.current.has(key)) {
        seen.current.add(key)
        notify(reminder)
      }
    }
  }, [due, snoozed])

  const visible = due.filter((r) => !snoozed.has(`${r.reminderId}:${r.occurrenceAt}`))

  function snooze(reminder: DueReminder, minutes: number) {
    const key = `${reminder.reminderId}:${reminder.occurrenceAt}`
    setSnoozed((prev) => new Set(prev).add(key))
    toast.success(`Reminder snoozed for ${minutes} minutes`)
    window.setTimeout(() => {
      setSnoozed((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, minutes * 60_000)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={`${visible.length} reminders`} className="relative" />
        }
      >
        {visible.length ? <BellRingIcon /> : <BellIcon />}
        {visible.length ? (
          <span className="absolute top-1 right-1 flex size-2 rounded-full bg-brand" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="max-h-96 overflow-y-auto p-1">
          {visible.length ? (
            visible.map((r) => (
              <div
                key={`${r.reminderId}:${r.occurrenceAt}`}
                className="flex items-start gap-2 rounded-md p-2 hover:bg-white/[0.04]"
              >
                <ClockIcon className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <button
                  type="button"
                  onClick={() => openTask(r.taskId)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm">{r.title}</p>
                  <p className="text-xs text-subtle">{formatRelative(r.occurrenceAt)}</p>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Snooze 10 minutes"
                    title="Snooze 10m"
                    onClick={() => snooze(r, 10)}
                  >
                    <ClockIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Dismiss"
                    onClick={() => dismiss.mutate({ reminderId: r.reminderId, occurrenceAt: r.occurrenceAt })}
                  >
                    <CheckIcon />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className={cn("px-3 py-6 text-center text-sm text-subtle")}>No reminders due</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
