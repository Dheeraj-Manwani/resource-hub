"use client"

import type { OverviewSectionProps } from "./section-context"
import { overviewSectionLimit } from "@/lib/overview/sections"

import { QueryFeedback } from "@/components/query-feedback"
import { useHabitActions } from "@/components/habits/habit-actions-provider"
import { useOverviewSection } from "@/hooks/queries/overview"
import { formatRelative } from "@/lib/format"
import { HabitName, habitDateLabel, habitWorkLabel } from "./habit-section-ui"
import { PageLink, SectionHeader } from "./section-ui"

export function RecentHabitActivitySection({
  options,
}: Pick<OverviewSectionProps, "options">) {
  const limit = overviewSectionLimit("recent-habit-activity", options)
  const query = useOverviewSection("recent-habit-activity")
  const actions = useHabitActions()
  return (
    <section aria-label="Recent habit activity">
      <SectionHeader title="Recent habit activity">
        <PageLink href="/habits">All habits</PageLink>
      </SectionHeader>
      <p className="text-xs text-subtle">Latest saved or edited entries</p>
      <QueryFeedback query={query} label="recent habit activity" />
      {query.data &&
        (query.data.items.length ? (
          query.data.items.slice(0, limit).map((entry) => (
            <div key={entry.id} className="border-b border-border py-3">
              <HabitName
                habit={entry.habit}
                onOpen={() => actions.openHabit(entry.habit.id, entry.date)}
              />
              <p className="mt-1 text-xs text-subtle">
                {entry.kind === "skip"
                  ? "Skipped"
                  : entry.source === "timer"
                    ? `${habitWorkLabel(entry.minutes)} recorded by timer`
                    : entry.unit === "done"
                      ? "Marked done"
                      : `${entry.amount} ${entry.unit} logged`}{" "}
                · {habitDateLabel(entry.date)}
              </p>
              {entry.notes && (
                <p className="mt-1 line-clamp-2 text-xs break-words text-text-muted">
                  {entry.notes}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="text-xs text-subtle">
                  Updated {formatRelative(entry.updatedAt)}
                </span>
                <button
                  type="button"
                  className="min-h-11 text-xs font-medium text-brand hover:text-brand-hover"
                  onClick={() => actions.openHabit(entry.habit.id, entry.date)}
                >
                  View day
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="py-4 text-sm text-text-muted">
            Log progress or save a timer session to see your recent activity.
          </p>
        ))}
    </section>
  )
}
