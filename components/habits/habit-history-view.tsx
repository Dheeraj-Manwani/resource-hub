"use client"
import { useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { QueryFeedback } from "@/components/query-feedback"
import { useHabitHistory, useHabits } from "@/hooks/queries/habits"
import {
  addDays,
  dateSchema,
  weekDates,
  type Habit,
  type HabitLog,
} from "@/lib/habits/model"
import {
  historyStateLabels,
  historyBounds,
  shiftHistoryDate,
  type HabitHistory,
  type HistoryDay,
  type HistoryView,
  type ConsistencyWeek,
} from "@/lib/habits/history"
import { habitColors } from "@/lib/habits/planning"
import { HabitDetails, LogDialog } from "./habits-view"
import { controlClass } from "./habit-form"
import { HabitMotivationPanel } from "./habit-motivation"

const viewNames: Record<HistoryView, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "12 weeks",
}
const stateClasses = {
  complete: "border-green-500/50 bg-green-500/25 text-green-400",
  partial: "border-brand/50 bg-brand-soft text-brand",
  missed: "border-rose-500/25 bg-rose-500/5 text-text-muted",
  skipped: "border-blue-400/40 bg-blue-400/10 text-blue-400",
  rest: "border-border bg-muted/10 text-text-muted",
  pending: "border-dashed border-border bg-muted/30 text-text-muted",
}
const stateSymbols = {
  complete: "✓",
  partial: "◐",
  missed: "·",
  skipped: "↷",
  rest: "—",
  pending: "○",
}
function shortDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00Z`))
}
export function formatWork(minutes: number) {
  if (minutes > 0 && minutes < 1) return `${Math.round(minutes * 60)} sec`
  return minutes >= 60
    ? `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(minutes / 60)} hr`
    : `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(minutes)} min`
}
function Stat({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold break-words tabular-nums">
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-text-muted">{detail}</p>}
    </div>
  )
}
function dayLabel(habit: HabitHistory, day: HistoryDay) {
  const label =
    day.state === "rest" && day.flexible
      ? "Flexible day; no work saved"
      : day.state === "rest" && day.eligible && day.goalPeriod !== "day"
        ? "No work saved on this day"
        : historyStateLabels[day.state]
  return `${habit.name}, ${day.date}, ${label}, ${day.amount} ${day.unit} recorded, ${formatWork(day.minutes)} time recorded${day.goalTarget ? `; ${day.goalAmount} / ${day.goalTarget} ${day.unit} per ${day.goalPeriod}${day.goalComplete ? "; period goal met" : ""}` : ""}`
}
function Heatmap({
  habit,
  weekStart,
  onDay,
}: {
  habit: HabitHistory
  weekStart: number
  onDay: (date: string) => void
}) {
  const first = weekDates(habit.days[0].date, weekStart)[0],
    last = weekDates(habit.days.at(-1)!.date, weekStart)[6],
    dayMap = new Map(habit.days.map((day) => [day.date, day]))
  const dates: string[] = []
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date)
  return (
    <div
      className="overflow-x-auto pb-2"
      role="group"
      aria-label={`${habit.name} heatmap`}
    >
      <div
        className="flex gap-2"
        style={{ minWidth: (dates.length / 7) * 34 + 32 }}
      >
        <div className="grid shrink-0 grid-rows-7 gap-1 text-[10px] text-text-muted">
          {weekDates("2026-01-05", weekStart).map((date) => (
            <span className="flex h-8 items-center" key={date}>
              {new Intl.DateTimeFormat("en", {
                weekday: "short",
                timeZone: "UTC",
              }).format(new Date(`${date}T12:00Z`))}
            </span>
          ))}
        </div>
        <div
          className="grid grid-flow-col grid-rows-7 gap-1"
          style={{
            gridTemplateColumns: `repeat(${dates.length / 7}, minmax(28px, 40px))`,
          }}
        >
          {dates.map((date) => {
            const day = dayMap.get(date)
            return day ? (
              <button
                key={date}
                type="button"
                aria-label={dayLabel(habit, day)}
                title={dayLabel(habit, day)}
                onClick={() => onDay(date)}
                className={`flex h-8 min-w-7 items-center justify-center rounded-md border text-xs focus-visible:outline-2 focus-visible:outline-ring ${stateClasses[day.state]}`}
              >
                <span aria-hidden>{stateSymbols[day.state]}</span>
              </button>
            ) : (
              <span className="h-8" key={date} />
            )
          })}
        </div>
      </div>
    </div>
  )
}
function ConsistencyChart({
  weeks,
  onWeek,
}: {
  weeks: ConsistencyWeek[]
  onWeek: (date: string) => void
}) {
  const segments: string[][] = []
  let segment: string[] = []
  weeks.forEach((week, index) => {
    if (week.rate === null) {
      if (segment.length) segments.push(segment)
      segment = []
    } else segment.push(`${40 + index * 46},${125 - week.rate}`)
  })
  if (segment.length) segments.push(segment)
  return (
    <section
      aria-label="Consistency trend"
      className="min-w-0 rounded-xl border bg-card p-4 sm:p-5"
    >
      <h3 className="font-medium">Consistency over 12 weeks</h3>
      <p className="mt-1 text-xs text-text-muted">
        Closed planned goals only. Skips, rest days, paused periods and ongoing
        goals stay out. Gaps mean there were no eligible goals.
      </p>
      <svg
        viewBox="0 0 580 150"
        className="mt-4 w-full"
        role="img"
        aria-label={`Completion trend: ${weeks.map((w) => `${w.start}: ${w.rate === null ? "no eligible goals" : `${w.rate}% (${w.completed}/${w.eligible})`}`).join("; ")}`}
      >
        {[0, 50, 100].map((rate) => (
          <g key={rate}>
            <line
              x1="36"
              x2="565"
              y1={125 - rate}
              y2={125 - rate}
              stroke="currentColor"
              className="text-border"
            />
            <text
              x="0"
              y={129 - rate}
              fill="currentColor"
              fontSize="10"
              className="text-text-muted"
            >
              {rate}%
            </text>
          </g>
        ))}
        {segments.map((points, i) => (
          <polyline
            key={i}
            points={points.join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-brand"
          />
        ))}
        {weeks.map((week, index) =>
          week.rate === null ? null : (
            <circle
              key={week.start}
              cx={40 + index * 46}
              cy={125 - week.rate}
              r="3.5"
              fill="currentColor"
              className="text-brand"
            />
          )
        )}
      </svg>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
        {weeks.map((week) => (
          <button
            key={week.start}
            className="min-h-11 rounded-md px-1 text-left text-[10px] text-text-muted hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`Consistency week ${week.start}: ${week.completed} of ${week.eligible} goals; ${week.rate === null ? "no eligible goals" : `${week.rate}%`}`}
            onClick={() => onWeek(week.start)}
          >
            {shortDate(week.start)}
            <span className="block font-medium text-foreground">
              {week.rate === null ? "—" : `${week.rate}%`}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
export function HabitHistoryView({
  habits,
  selectedId,
  onSelect,
  onEdit,
}: {
  habits: Habit[]
  selectedId: string
  onSelect: (id: string) => void
  onEdit: (id: string) => void
}) {
  const [date, setDate] = useState(""),
    [view, setView] = useState<HistoryView>("quarter"),
    [includeArchived, setIncludeArchived] = useState(
      () => habits.find((h) => h.id === selectedId)?.status === "archived"
    )
  const [day, setDay] = useState<{ habitId: string; date: string } | null>(
      null
    ),
    [week, setWeek] = useState<string | null>(null)
  const query = useHabitHistory(date, view, selectedId || undefined),
    data = query.data
  const items =
    data?.items.filter(
      (h) => includeArchived || h.status !== "archived" || h.id === selectedId
    ) ?? []
  const options = habits.filter(
    (h) => includeArchived || h.status !== "archived" || h.id === selectedId
  )
  const minutes = items.reduce((sum, h) => sum + h.summary.minutes, 0),
    workedDays = new Set(items.flatMap((h) => h.summary.workedDates)).size,
    goals = items.reduce((sum, h) => sum + h.summary.completedGoals, 0)
  const eligible = items.reduce((sum, h) => sum + h.range.eligible, 0),
    complete = items.reduce((sum, h) => sum + h.range.completed, 0),
    rangeMinutes = items.reduce((sum, h) => sum + h.range.minutes, 0)
  const timeWeeks =
    items[0]?.timeWeeks.map((w) => ({
      ...w,
      minutes: items.reduce(
        (sum, h) =>
          sum + (h.timeWeeks.find((r) => r.start === w.start)?.minutes ?? 0),
        0
      ),
      target: items.reduce(
        (sum, h) =>
          sum + (h.timeWeeks.find((r) => r.start === w.start)?.target ?? 0),
        0
      ),
      parts: items.map((h) => ({
        id: h.id,
        name: h.name,
        color: habitColors[h.color],
        minutes: h.timeWeeks.find((r) => r.start === w.start)?.minutes ?? 0,
      })),
    })) ?? []
  const scale = Math.max(1, ...timeWeeks.flatMap((w) => [w.minutes, w.target]))
  const trend =
    items[0]?.trend.map((w) => {
      const eligible = items.reduce(
          (sum, h) =>
            sum + (h.trend.find((r) => r.start === w.start)?.eligible ?? 0),
          0
        ),
        completed = items.reduce(
          (sum, h) =>
            sum + (h.trend.find((r) => r.start === w.start)?.completed ?? 0),
          0
        )
      return {
        ...w,
        eligible,
        completed,
        rate: eligible ? Math.round((completed / eligible) * 100) : null,
      }
    }) ?? []
  const selectedWeek = timeWeeks.find((w) => w.start === week)
  function chooseWeek(anchor: string, id?: string) {
    setDate(anchor)
    setView("week")
    if (id) onSelect(id)
    setWeek(null)
  }
  return (
    <div className="space-y-5" aria-label="Habit history">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 gap-1 text-xs text-text-muted">
          Habit
          <select
            aria-label="History habit"
            className={`${controlClass} h-11 max-w-full`}
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">All habits</option>
            {options.map((h) => (
              <option value={h.id} key={h.id}>
                {h.icon} {h.name}
                {h.status === "archived" ? " · archived" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-text-muted">
          View
          <select
            className={`${controlClass} h-11`}
            aria-label="History view"
            value={view}
            onChange={(e) => setView(e.target.value as HistoryView)}
          >
            {Object.entries(viewNames).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-text-muted">
          Date
          <Input
            className="h-11 w-40"
            aria-label="Insights date"
            type="date"
            min="1900-01-01"
            max={data?.today}
            value={date || data?.date || ""}
            onChange={(e) => {
              if (dateSchema.safeParse(e.target.value).success)
                setDate(e.target.value)
            }}
          />
        </label>
        <div className="flex gap-1">
          <Button
            className="size-11"
            variant="outline"
            aria-label="Previous history period"
            disabled={
              !data ||
              !dateSchema.safeParse(shiftHistoryDate(data.date, view, -1))
                .success
            }
            onClick={() => setDate(shiftHistoryDate(data!.date, view, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            className="size-11"
            variant="outline"
            aria-label="Next history period"
            disabled={
              !data ||
              historyBounds(
                shiftHistoryDate(data.date, view, 1),
                view,
                data.weekStart
              ).from > data.today ||
              data.date === data.today
            }
            onClick={() => {
              const next = shiftHistoryDate(data!.date, view, 1)
              setDate(next > data!.today ? data!.today : next)
            }}
          >
            <ChevronRightIcon />
          </Button>
          <Button className="h-11" variant="ghost" onClick={() => setDate("")}>
            Latest
          </Button>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked)
              if (
                !e.target.checked &&
                habits.find((h) => h.id === selectedId)?.status === "archived"
              )
                onSelect("")
            }}
          />
          Include archived
        </label>
      </div>
      <QueryFeedback query={query} label="habit history" />
      {data && (
        <>
          <section aria-label="Your work so far" className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold">Your work so far</h2>
              <p className="mt-1 text-sm text-text-muted">
                Real effort, kept over time. All-time totals for{" "}
                {selectedId
                  ? "this habit"
                  : includeArchived
                    ? "all habits, including archived"
                    : "active and paused habits"}{" "}
                · streaks through {data.today}.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat
                label="Recorded time"
                value={formatWork(minutes)}
                detail="Working time; pauses excluded"
              />
              <Stat
                label="Days you showed up"
                value={workedDays}
                detail="Distinct days with saved work"
              />
              <Stat
                label="Goals met"
                value={goals}
                detail="Each daily, weekly or monthly goal once"
              />
              <Stat
                label="Saved habits"
                value={items.length}
                detail="Work stays visible after archiving"
              />
            </div>
          </section>
          <p
            className="rounded-lg border bg-muted/20 p-3 text-sm"
            aria-label="Selected history range"
          >
            {data.from} – {data.to} · {formatWork(rangeMinutes)} recorded in
            this view · {complete} / {eligible} closed scheduled periods
            {eligible
              ? ` (${Math.round((complete / eligible) * 100)}%)`
              : " · No closed scheduled periods yet"}
          </p>
          {!items.length ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-text-muted">
              No habits in this view. Include archived habits to revisit earlier
              work.
            </p>
          ) : (
            <>
              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                <section
                  aria-label="Weekly time"
                  className="min-w-0 rounded-xl border bg-card p-4 sm:p-5"
                >
                  <h3 className="font-medium">Time you made</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Saved minutes, split by habit. The line marks daily targets
                    and whole weekly targets. Monthly and partial-week goals
                    appear in each habit below.
                  </p>
                  <div className="mt-4 space-y-2">
                    {timeWeeks.map((w) => (
                      <button
                        key={w.start}
                        aria-label={`Time week ${w.start}: ${w.minutes} minutes recorded, ${w.target} minutes target`}
                        onClick={() => setWeek(w.start)}
                        className="block min-h-11 w-full rounded-md p-1 text-left hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="mb-1 flex flex-wrap justify-between gap-1 text-xs">
                          <span>{shortDate(w.start)}</span>
                          <span>
                            {formatWork(w.minutes)}
                            {w.target > 0
                              ? ` / ${formatWork(w.target)} target`
                              : " recorded"}
                          </span>
                        </span>
                        <span className="relative block h-3 rounded bg-muted/50">
                          <span
                            className="flex h-full overflow-hidden rounded"
                            style={{ width: `${(w.minutes / scale) * 100}%` }}
                          >
                            {w.parts
                              .filter((p) => p.minutes > 0)
                              .map((p) => (
                                <span
                                  key={p.id}
                                  title={`${p.name}: ${formatWork(p.minutes)}`}
                                  style={{
                                    width: `${(p.minutes / w.minutes) * 100}%`,
                                    backgroundColor: p.color,
                                  }}
                                />
                              ))}
                          </span>
                          {w.target > 0 && (
                            <span
                              aria-hidden
                              className="absolute -top-0.5 h-4 w-px bg-foreground/70"
                              style={{ left: `${(w.target / scale) * 100}%` }}
                            />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-muted">
                    {items.map((h) => (
                      <span
                        key={h.id}
                        className="flex min-w-0 items-center gap-1.5"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: habitColors[h.color] }}
                        />
                        {h.name}
                      </span>
                    ))}
                  </div>
                </section>
                <ConsistencyChart
                  weeks={trend}
                  onWeek={(anchor) => chooseWeek(anchor)}
                />
              </div>
              <div
                className="flex flex-wrap gap-3 text-xs text-text-muted"
                aria-label="Heatmap legend"
              >
                {Object.entries(historyStateLabels).map(([state, label]) => (
                  <span key={state} className="flex items-center gap-1.5">
                    <span
                      className={`grid size-6 place-items-center rounded border ${stateClasses[state as keyof typeof stateClasses]}`}
                    >
                      {stateSymbols[state as keyof typeof stateSymbols]}
                    </span>
                    {label}
                  </span>
                ))}
              </div>
              {items.map((h) => (
                <section
                  key={h.id}
                  aria-label={`${h.name} history`}
                  className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        className="min-h-11 text-left text-base font-semibold break-words"
                        onClick={() => onSelect(h.id)}
                      >
                        {h.icon} {h.name}
                      </button>
                      <p className="text-xs text-text-muted capitalize">
                        {h.status} · {formatWork(h.summary.minutes)} all time ·{" "}
                        {h.summary.completedGoals} goals met
                        {h.summary.weeklyTargetsMet > 0 &&
                          ` · ${h.summary.weeklyTargetsMet} flexible weekly targets met`}
                      </p>
                      {h.reason && (
                        <p className="mt-2 text-sm break-words text-text-muted">
                          {h.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-5 text-sm">
                      <p>
                        <span className="block text-xl font-semibold">
                          {h.summary.currentStreak}
                        </span>
                        <span className="text-xs text-text-muted">
                          {h.status === "archived" ? "Last" : "Current"} streak
                        </span>
                      </p>
                      <p>
                        <span className="block text-xl font-semibold">
                          {h.summary.bestStreak}
                        </span>
                        <span className="text-xs text-text-muted">
                          Best streak
                        </span>
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted">
                    Streaks count planned goal periods; flexible habits use
                    their weekly target. Rest days and skips keep the streak;
                    ongoing goals can still be met. For weekly/monthly habits,
                    day colours show daily effort and goal totals appear below.
                  </p>
                  <Heatmap
                    habit={h}
                    weekStart={data.weekStart}
                    onDay={(anchor) => setDay({ habitId: h.id, date: anchor })}
                  />
                  <HabitMotivationPanel habitId={h.id} />
                  {!!h.summary.totals.length && (
                    <p className="text-sm">
                      Saved totals:{" "}
                      {h.summary.totals
                        .map((t) => `${t.amount} ${t.unit}`)
                        .join(" · ")}
                    </p>
                  )}
                  {!!h.periods.length && (
                    <div
                      className="grid gap-2 sm:grid-cols-2"
                      aria-label={`${h.name} goal periods`}
                    >
                      {h.periods.map((p) => (
                        <button
                          key={p.key}
                          className="min-h-16 rounded-lg border p-3 text-left text-xs hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() =>
                            setDay({
                              habitId: h.id,
                              date:
                                p.firstWorkDate ??
                                (p.end <= data.today ? p.end : data.today),
                            })
                          }
                        >
                          <span className="block font-medium">
                            {p.start} – {p.end}
                          </span>
                          <span className="mt-1 block">
                            {p.amount} / {p.target} {p.unit} ·{" "}
                            {historyStateLabels[p.state]}
                            {!p.eligible && !p.complete
                              ? " · Neutral for consistency"
                              : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!!h.notes.length && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">
                        Words from your work
                      </h4>
                      {h.notes.map((note) => (
                        <button
                          className="block min-h-11 w-full rounded-lg border p-3 text-left text-sm hover:bg-muted/20"
                          key={note.id}
                          onClick={() =>
                            setDay({ habitId: h.id, date: note.date })
                          }
                        >
                          <span className="mb-1 block text-xs text-text-muted">
                            {note.date} · {note.source}
                          </span>
                          <span className="line-clamp-3 break-words whitespace-pre-wrap">
                            {note.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!h.summary.workedDates.length && (
                    <p className="text-sm text-text-muted">
                      Your first saved effort will appear here. Plans leave the
                      record open.
                    </p>
                  )}
                </section>
              ))}
            </>
          )}
          <p className="text-xs text-text-muted">
            Dates keep the timezone captured when work was recorded. Current
            display: {data.timezone}. Deleted entries and planned minutes add no
            working time. Corrections recalculate totals and streaks.
          </p>
        </>
      )}
      {day && (
        <HistoryDay
          key={`${day.habitId}:${day.date}`}
          selection={day}
          onClose={() => setDay(null)}
          onEdit={(id) => {
            setDay(null)
            onEdit(id)
          }}
        />
      )}
      {selectedWeek && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setWeek(null)
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Time saved · {shortDate(selectedWeek.start)}
              </DialogTitle>
              <DialogDescription>
                {formatWork(selectedWeek.minutes)} in this view. Choose a habit
                to inspect its week.
              </DialogDescription>
            </DialogHeader>
            {selectedWeek.parts.map((p) => (
              <Button
                className="h-auto min-h-11 justify-between whitespace-normal"
                variant="outline"
                key={p.id}
                onClick={() => chooseWeek(selectedWeek.start, p.id)}
              >
                <span>{p.name}</span>
                <span>{formatWork(p.minutes)}</span>
              </Button>
            ))}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
function HistoryDay({
  selection,
  onClose,
  onEdit,
}: {
  selection: { habitId: string; date: string }
  onClose: () => void
  onEdit: (id: string) => void
}) {
  const [date, setDate] = useState(selection.date),
    [editing, setEditing] = useState<{ log?: HabitLog } | null>(null),
    query = useHabits(date)
  const habit = query.data?.items.find((h) => h.id === selection.habitId)
  if (habit && query.data)
    return editing ? (
      <LogDialog
        habit={habit}
        bundle={query.data}
        log={editing.log}
        onClose={() => setEditing(null)}
      />
    ) : (
      <HabitDetails
        dayOnly
        habit={habit}
        bundle={query.data}
        onClose={onClose}
        onDate={setDate}
        onEdit={() => onEdit(habit.id)}
        onLog={(log) => setEditing({ log })}
      />
    )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saved effort · {date}</DialogTitle>
          <DialogDescription>
            Loading this habit&apos;s entries.
          </DialogDescription>
        </DialogHeader>
        <QueryFeedback query={query} label="saved entries" />
        {query.data && !habit && <p>This habit is no longer available.</p>}
      </DialogContent>
    </Dialog>
  )
}
