"use client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { QueryFeedback } from "@/components/query-feedback"
import { useHabits } from "@/hooks/queries/habits"
import {
  flexibleProgress,
  goalLabel,
  progressOn,
  statusOn,
} from "@/lib/habits/model"
import { calendarBlocks } from "@/lib/habits/planning"
import { useHabitActions } from "./habit-actions-provider"
import { useHabitTimer } from "./habit-timer-provider"

export function HabitsToday() {
  const query = useHabits(""),
    actions = useHabitActions(),
    timer = useHabitTimer()
  const bundle = query.data
  const rows =
    bundle?.items.filter((habit) => {
      const progress = progressOn(habit, bundle.today)
      return (
        progress &&
        statusOn(habit, bundle.today, bundle.today) === "active" &&
        progress.version.config.schedule !== "flexible" &&
        (calendarBlocks(
          habit,
          bundle.today,
          bundle.today,
          bundle.today,
          bundle.timezone
        ).length > 0 ||
          progress.logs.length > 0)
      )
    }) ?? []
  const completed = rows.filter(
    (habit) => progressOn(habit, bundle!.today)?.complete
  ).length
  const flexible =
    bundle?.items.filter(
      (habit) =>
        habit.status === "active" &&
        progressOn(habit, bundle.today) &&
        flexibleProgress(habit, bundle.today)
    ) ?? []
  const visible = [...rows]
    .sort(
      (a, b) =>
        Number(progressOn(a, bundle!.today)?.complete) -
        Number(progressOn(b, bundle!.today)?.complete)
    )
    .slice(0, 4)
  return (
    <section
      aria-label="Habits today"
      className="rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          Habits today{" "}
          <span className="ml-2 text-xs font-normal text-text-muted">
            {completed} / {rows.length} goals met
          </span>
        </h2>
        <Link
          href="/habits"
          className="inline-flex min-h-11 items-center text-xs font-medium text-brand"
        >
          All habits →
        </Link>
      </div>
      <QueryFeedback query={query} label="today's habits" loading={false} />
      {visible.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((habit) => {
            const progress = progressOn(habit, bundle!.today)!
            return (
              <li
                key={habit.id}
                className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <button
                  className="min-h-11 min-w-[min(100%,10rem)] flex-1 text-left"
                  onClick={() => actions.openHabit(habit.id, bundle!.today)}
                >
                  <span className="block text-sm font-medium">
                    {progress.complete ? "✓" : habit.icon} {habit.name}
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {goalLabel(progress.version.config)} · {progress.amount} /{" "}
                    {progress.target}
                    {progress.complete
                      ? " · Goal met"
                      : progress.skipped
                        ? " · Skipped"
                        : ""}
                  </span>
                </button>
                {!progress.complete && (
                  <Button
                    className="h-11"
                    size="sm"
                    variant="outline"
                    disabled={!!timer.session || timer.pending}
                    onClick={() => timer.chooseHabit(habit)}
                  >
                    Start timer
                  </Button>
                )}
                <Button
                  className="h-11"
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.openHabit(habit.id, bundle!.today)}
                >
                  {progress.complete
                    ? "View work"
                    : progress.version.config.goalType === "done"
                      ? "Mark done"
                      : "Log progress"}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {flexible.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {flexible.map((habit) => {
            const progress = flexibleProgress(habit, bundle!.today)!
            return (
              <Button
                key={habit.id}
                className="h-auto min-h-11 text-left whitespace-normal"
                variant="outline"
                onClick={() => actions.openHabit(habit.id, bundle!.today)}
              >
                {habit.icon} {habit.name} · {progress.days} / {progress.target}{" "}
                days this week
              </Button>
            )
          })}
        </div>
      )}
      {bundle && !rows.length && !flexible.length && (
        <p className="text-sm text-text-muted">
          {bundle.items.length
            ? "No habits planned for today. Your earlier work stays saved."
            : "Build a rhythm of your own. Create your first habit when you're ready."}
        </p>
      )}
    </section>
  )
}
