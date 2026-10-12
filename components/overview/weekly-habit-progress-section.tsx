"use client"

import { CheckIcon, MinusIcon } from "lucide-react"
import { QueryFeedback } from "@/components/query-feedback"
import { useHabitActions } from "@/components/habits/habit-actions-provider"
import { useOverviewSection } from "@/hooks/queries/overview"
import { historyStateLabels } from "@/lib/habits/history"
import { cn } from "@/lib/utils"
import { HabitName, habitDateLabel, habitWorkLabel } from "./habit-section-ui"
import { PageLink, SectionHeader } from "./section-ui"

const stateClasses = {
  complete: "border-green-500/50 bg-green-500/15 text-green-400",
  partial: "border-brand/50 bg-brand-soft text-brand",
  missed: "border-border text-text-muted",
  skipped: "border-blue-400/40 bg-blue-400/10 text-blue-400",
  rest: "border-border text-subtle",
  pending: "border-dashed border-border text-text-muted",
}
export function WeeklyHabitProgressSection() {
  const query = useOverviewSection("weekly-habit-progress")
  const actions = useHabitActions()
  return (
    <section aria-label="Weekly habit progress">
      <SectionHeader title="Weekly habit progress">
        <PageLink href="/habits">All habits</PageLink>
      </SectionHeader>
      {query.data && (
        <p className="text-xs text-subtle">
          {habitDateLabel(query.data.from)} – {habitDateLabel(query.data.to)} ·{" "}
          {query.data.timezone}
        </p>
      )}
      <QueryFeedback query={query} label="weekly habit progress" />
      {query.data &&
        (query.data.items.length ? (
          <>
            {query.data.items.map((habit) => (
              <div
                key={habit.id}
                className="border-b border-border py-3"
                aria-label={`${habit.name} this week`}
              >
                <HabitName
                  habit={habit}
                  onOpen={() => actions.openHabit(habit.id, query.data!.today)}
                />
                <p className="my-2 text-xs text-subtle">
                  {habit.eligible
                    ? `${habit.completed} / ${habit.eligible} goals met so far`
                    : "No goals due so far"}{" "}
                  · {habitWorkLabel(habit.minutes)} recorded
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {habit.days.map((day) => {
                    const future = day.date > query.data!.today
                    const label = future
                      ? "Future plan"
                      : historyStateLabels[day.state]
                    return (
                      <button
                        key={day.date}
                        type="button"
                        className={cn(
                          "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md border text-xs",
                          stateClasses[day.state]
                        )}
                        aria-label={`${habit.name}, ${day.date}, ${label}, ${habitWorkLabel(day.minutes)} recorded`}
                        title={`${habitDateLabel(day.date)} · ${label}`}
                        onClick={() => actions.openHabit(habit.id, day.date)}
                      >
                        <span>
                          {new Intl.DateTimeFormat("en", {
                            weekday: "narrow",
                            timeZone: "UTC",
                          }).format(new Date(`${day.date}T12:00Z`))}
                        </span>
                        {day.state === "complete" ? (
                          <CheckIcon aria-hidden className="size-3.5" />
                        ) : day.state === "rest" ? (
                          <MinusIcon aria-hidden className="size-3.5" />
                        ) : (
                          <span aria-hidden>
                            {day.state === "partial"
                              ? "◐"
                              : day.state === "skipped"
                                ? "↷"
                                : "○"}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <p className="mt-3 text-xs text-subtle">
              ✓ Goal met · ◐ Saved effort · ↷ Skipped · — Rest. Weekly and
              monthly goals count once per goal period.
            </p>
            {query.data.total > query.data.items.length && (
              <p className="mt-2 text-xs text-subtle">
                Showing five habits. Browse all habits for more progress.
              </p>
            )}
          </>
        ) : (
          <p className="py-4 text-sm text-text-muted">
            Your saved habit progress will appear here throughout the week.
          </p>
        ))}
    </section>
  )
}
