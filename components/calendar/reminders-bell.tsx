"use client"

import { BellIcon, BellRingIcon, CheckIcon, ClockIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
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
import {
  useHabitReminders,
  useHabitReminderAction,
} from "@/hooks/queries/habits"
import { useHabitActions } from "@/components/habits/habit-actions-provider"
import { habitReminderKey, type DueHabitReminder } from "@/lib/habits/planning"
import { QueryFeedback } from "@/components/query-feedback"
import { formatRelative } from "@/lib/format"
import type { DueReminder } from "@/lib/server/dal/reminders"
import { cn } from "@/lib/utils"

function requestNotificationPermission() {
  if (typeof Notification === "undefined") return false
  if (Notification.permission !== "default") return Notification.permission
  return Notification.requestPermission().catch(() => "denied")
}

function notify(reminder: DueReminder) {
  showToast(reminder.title, {
    description: "Reminder",
    icon: <ClockIcon className="size-4" />,
  })
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification(reminder.title, {
        body: "Task reminder",
        tag: reminder.reminderId,
      })
    } catch {
      /* The in-app reminder remains available. */
    }
  }
}

/** Polls due reminders every 60s + on focus; toasts (and browser-notifies,
 * if permission was granted) the first time each one appears, and lists
 * everything pending in a bell dropdown with dismiss/snooze. */
export function RemindersBell() {
  const { data: due = [] } = useDueReminders()
  const dismiss = useDismissReminder()
  const { openTask } = useDetailDrawer()
  const habitQuery = useHabitReminders(),
    habitAction = useHabitReminderAction(),
    habits = useMemo(() => habitQuery.data?.items ?? [], [habitQuery.data])
  const habitActions = useHabitActions()
  const seen = useRef<Set<string>>(new Set())
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set())

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
  useEffect(() => {
    const storageKey = `resource:habit-reminder-notices:${habitActions.userId}`
    for (const reminder of habits) {
      const key = `${habitReminderKey(reminder)}:${reminder.notifyAt}`
      if (seen.current.has(key)) continue
      seen.current.add(key)
      try {
        const saved = JSON.parse(
          localStorage.getItem(storageKey) ?? "{}"
        ) as Record<string, number>
        if (saved[key]) continue
        const recent = Object.fromEntries(
          Object.entries(saved).filter(
            ([, at]) => typeof at === "number" && at > Date.now() - 2 * 86400000
          )
        )
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...recent, [key]: Date.now() })
        )
      } catch {}
      showToast(`${reminder.icon} ${reminder.title}`, {
        description: "Habit reminder — choose when to start or log.",
        action: {
          label: "Open habit",
          onClick: () =>
            habitActions.openHabit(reminder.habitId, reminder.date),
        },
      })
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          const notification = new Notification(reminder.title, {
            body: "Habit reminder. Start or log when you're ready.",
            tag: key,
          })
          notification.onclick = () => {
            window.focus()
            habitActions.openHabit(reminder.habitId, reminder.date)
            notification.close()
          }
        } catch {}
      }
    }
  }, [habits, habitActions])

  const visible = due.filter(
    (r) => !snoozed.has(`${r.reminderId}:${r.occurrenceAt}`)
  )
  const visibleCount = visible.length + habits.length
  function actOnHabit(
    reminder: DueHabitReminder,
    action: "dismiss" | "snooze"
  ) {
    habitAction.mutate(
      {
        id: reminder.habitId,
        body: {
          id: crypto.randomUUID(),
          versionId: reminder.versionId,
          date: reminder.date,
          time: reminder.time,
          action,
          ...(action === "snooze" ? { minutes: 10 as const } : {}),
        },
      },
      {
        onSuccess: () =>
          toast.success(
            action === "snooze"
              ? "Habit reminder snoozed for 10 minutes"
              : "Habit reminder dismissed"
          ),
      }
    )
  }

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
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${visibleCount} reminders`}
            className="relative"
          />
        }
      >
        {visibleCount ? <BellRingIcon /> : <BellIcon />}
        {visibleCount ? (
          <span className="absolute top-1 right-1 flex size-2 rounded-full bg-brand" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="max-h-96 overflow-y-auto p-1">
          <QueryFeedback
            query={habitQuery}
            label="habit reminders"
            loading={false}
          />
          {habits.map((r) => (
            <div
              key={habitReminderKey(r)}
              aria-label={`Habit reminder ${r.title}`}
              className="rounded-lg border border-brand/20 p-3"
            >
              <button
                type="button"
                className="min-h-11 w-full text-left"
                onClick={() => habitActions.openHabit(r.habitId, r.date)}
              >
                <span className="block text-sm font-medium">
                  {r.icon} {r.title}
                </span>
                <span className="block text-xs text-text-muted">
                  Habit · {r.date} {r.time} · Open to Start / Log
                </span>
              </button>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-11"
                  size="sm"
                  variant="outline"
                  disabled={habitAction.isPending}
                  onClick={() => actOnHabit(r, "snooze")}
                >
                  Snooze 10 minutes
                </Button>
                <Button
                  className="h-11"
                  size="sm"
                  variant="ghost"
                  disabled={habitAction.isPending}
                  onClick={() => actOnHabit(r, "dismiss")}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
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
                  <p className="text-xs text-subtle">
                    {formatRelative(r.occurrenceAt)}
                  </p>
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
                    loading={
                      dismiss.isPending &&
                      dismiss.variables?.reminderId === r.reminderId &&
                      dismiss.variables.occurrenceAt === r.occurrenceAt
                    }
                    onClick={() =>
                      dismiss.mutate({
                        reminderId: r.reminderId,
                        occurrenceAt: r.occurrenceAt,
                      })
                    }
                  >
                    <CheckIcon />
                  </Button>
                </div>
              </div>
            ))
          ) : !habits.length ? (
            <p className={cn("px-3 py-6 text-center text-sm text-subtle")}>
              No reminders due
            </p>
          ) : null}
        </div>
        <div className="border-t p-2">
          <Button
            className="min-h-11 w-full"
            size="sm"
            variant="ghost"
            onClick={async () => {
              const permission = await requestNotificationPermission()
              toast(
                permission === "granted"
                  ? "Browser alerts enabled while the app is open"
                  : "Use in-app reminders here. Browser alerts are unavailable or not permitted."
              )
            }}
          >
            Enable browser alerts
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
