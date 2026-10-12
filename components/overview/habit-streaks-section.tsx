"use client"

import { QueryFeedback } from "@/components/query-feedback"
import { useHabitActions } from "@/components/habits/habit-actions-provider"
import { useOverviewSection } from "@/hooks/queries/overview"
import { HabitName } from "./habit-section-ui"
import { PageLink, SectionHeader, countLabel } from "./section-ui"

export function HabitStreaksSection() {
  const query = useOverviewSection("habit-streaks")
  const actions = useHabitActions()
  return (
    <section aria-label="Habit streaks">
      <SectionHeader title="Habit streaks">
        <PageLink href="/habits">All habits</PageLink>
      </SectionHeader>
      <p className="text-xs text-subtle">
        Streaks count planned goal periods. Rest days and skips preserve them.
      </p>
      <QueryFeedback query={query} label="habit streaks" />
      {query.data &&
        (query.data.items.length ? (
          <>
            {query.data.items.map((habit) => (
              <div
                key={habit.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3"
              >
                <HabitName
                  habit={habit}
                  onOpen={() => actions.openHabit(habit.id, query.data!.today)}
                />
                <div className="text-right text-xs text-subtle">
                  <p className="text-sm font-medium text-foreground">
                    {countLabel(habit.current, "goal period")}
                  </p>
                  <p>Current streak · Best {habit.best}</p>
                </div>
              </div>
            ))}
            {query.data.total > query.data.items.length && (
              <p className="mt-3 text-xs text-subtle">
                Showing the five longest current streaks.
              </p>
            )}
          </>
        ) : (
          <p className="py-4 text-sm text-text-muted">
            Active habits will appear here. Each completed goal builds your
            streak.
          </p>
        ))}
    </section>
  )
}
