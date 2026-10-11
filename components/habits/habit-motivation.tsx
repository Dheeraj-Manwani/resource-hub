"use client"
import { useState } from "react"
import { AwardIcon, CheckIcon, Settings2Icon } from "lucide-react"
import {
  useHabitMotivation,
  useHabitPreferences,
  useUpdateHabitPreferences,
} from "@/hooks/queries/habits"
import {
  type HabitJourney,
  type MotivationPreferences,
} from "@/lib/habits/motivation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { QueryFeedback } from "@/components/query-feedback"
import { playHabitChime } from "./habit-reward-feedback"

function workTime(minutes: number) {
  return minutes < 60
    ? `${Math.round(minutes * 100) / 100} min`
    : `${Math.round(minutes / 6) / 10} hr`
}
export function HabitNudge({
  habitId,
  hasReason = false,
}: {
  habitId: string
  hasReason?: boolean
}) {
  const { data } = useHabitMotivation()
  const preferences = useHabitPreferences().data
  const habit = data?.items.find((h) => h.id === habitId)
  if (
    !preferences?.nudges ||
    preferences.quiet ||
    !habit?.nudge ||
    (hasReason && !habit.nudge.startsWith("Welcome back"))
  )
    return null
  return (
    <p
      className="mt-2 text-xs text-text-muted"
      aria-label="Habit encouragement"
    >
      {habit.nudge}
    </p>
  )
}

export function HabitExperienceSettings() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<Partial<MotivationPreferences>>({})
  const query = useHabitPreferences(),
    save = useUpdateHabitPreferences()
  const labels: Record<keyof MotivationPreferences, string> = {
    quiet: "Quiet mode",
    celebrations: "Completion celebrations",
    sound: "Celebration sound",
    nudges: "Gentle nudges",
    recaps: "Daily and weekly recaps",
  }
  return (
    <>
      <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
        <Settings2Icon />
        Experience
      </Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Habit experience</DialogTitle>
              <DialogDescription>
                Choose what feels good. Quiet mode hides celebrations, sound,
                nudges and recaps. Your journey and saved work stay visible.
              </DialogDescription>
            </DialogHeader>
            <QueryFeedback query={query} label="habit preferences" />
            {query.data && (
              <div className="space-y-2">
                {Object.entries(labels).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={
                        pending[key as keyof MotivationPreferences] ??
                        query.data![key as keyof MotivationPreferences]
                      }
                      disabled={save.isPending}
                      onChange={(e) => {
                        const patch = { [key]: e.target.checked }
                        setPending(patch)
                        save.mutate(patch, { onSettled: () => setPending({}) })
                      }}
                      className="size-5 accent-brand"
                    />
                  </label>
                ))}
                <p className="text-xs text-text-muted">
                  Sound is off by default. Animation follows your device’s
                  reduced-motion setting. Preferences apply to your account on
                  all devices.
                </p>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={query.data.quiet || !query.data.sound}
                  onClick={() => void playHabitChime()}
                >
                  Test sound
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

export function HabitMotivationPanel({
  habitId,
  recap = false,
}: {
  habitId?: string
  recap?: boolean
}) {
  const query = useHabitMotivation(),
    preferences = useHabitPreferences().data
  const data = query.data
  if (recap) {
    if (!data || !preferences?.recaps || preferences.quiet) return null
    const { today, week, previousWeek } = data.recaps
    if (!today.habits && !week.habits && !previousWeek.habits) return null
    return (
      <section
        aria-label="Habit recap"
        className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
      >
        <h3 className="font-medium">Time you made for yourself</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-text-muted">Today</p>
            <p className="mt-1 text-sm">
              {today.habits
                ? `Saved effort in ${today.habits} ${today.habits === 1 ? "habit" : "habits"}${today.minutes ? ` · ${workTime(today.minutes)} recorded` : ""}.`
                : "Your earlier work is still here. Today is open."}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted">This week so far</p>
            <p className="mt-1 text-sm">
              {week.days} {week.days === 1 ? "day" : "days"} with saved effort
              {week.minutes ? ` · ${workTime(week.minutes)} recorded` : ""}.
            </p>
            {previousWeek.days > 0 && (
              <p className="mt-1 text-xs text-text-muted">
                Last week: {previousWeek.days} days with saved effort
                {previousWeek.minutes
                  ? ` · ${workTime(previousWeek.minutes)}`
                  : ""}
                .
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Partial work counts here. Only saved records, including archived
          habits.
        </p>
      </section>
    )
  }
  const items =
    data?.items.filter((h) =>
      habitId ? h.id === habitId : h.status !== "archived"
    ) ?? []
  return (
    <section aria-label="Habit journey" className="space-y-4">
      <QueryFeedback query={query} label="habit journey" />
      {items.map((h) => (
        <Journey key={h.id} habit={h} />
      ))}
    </section>
  )
}
function Journey({ habit }: { habit: HabitJourney }) {
  const earned = habit.badges.filter((b) => b.earned)
  const next = habit.next
    .filter(
      (b) =>
        b.metric === "effortDays" ||
        b.metric === "minutes" ||
        b.metric === "goals" ||
        (b.metric === "weeklyGoals" &&
          (habit.goalPeriod === "week" || habit.flexible)) ||
        (b.metric === "monthlyGoals" && habit.goalPeriod === "month")
    )
    .slice(0, 3)
  return (
    <div
      className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      aria-label={`${habit.name} journey`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          {habit.icon} {habit.name} · Your journey
        </h3>
        <span className="text-xs text-text-muted">
          {earned.length} milestones · {workTime(habit.metrics.minutes)}{" "}
          invested
        </span>
      </div>
      {earned.length ? (
        <div className="flex flex-wrap gap-2">
          {earned.map((b) => (
            <div
              key={b.id}
              aria-label={`Earned milestone: ${b.title}`}
              title={b.description}
              className="flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand"
            >
              <AwardIcon aria-hidden className="size-4" />
              {b.title}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Your first saved effort starts the journey. No need to rush.
        </p>
      )}
      {!!next.length && (
        <div>
          <h4 className="mb-2 text-xs text-text-muted">
            Next steps · at your own pace
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            {next.map((b) => (
              <div className="min-w-0 rounded-lg border p-3" key={b.id}>
                <p className="text-sm font-medium">{b.title}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {b.metric === "minutes"
                    ? `${workTime(b.value)} / ${workTime(b.target)}`
                    : `${b.value} / ${b.target}`}{" "}
                  · {b.description}
                </p>
                <progress
                  className="mt-2 h-2 w-full accent-brand"
                  value={Math.min(b.value, b.target)}
                  max={b.target}
                  aria-label={`${b.title} progress`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {earned.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-text-muted">
          <CheckIcon aria-hidden className="size-4 shrink-0" />
          These milestones reflect your saved records. Corrections update
          eligibility; a past celebration never repeats. Taking a break does not
          remove earlier work.
        </p>
      )}
    </div>
  )
}
