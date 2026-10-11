"use client"
import { useState } from "react"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SproutIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/page-header"
import { QueryFeedback } from "@/components/query-feedback"
import { useHabits, useHabitWrite } from "@/hooks/queries/habits"
import { showToast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import {
  addDays,
  dateSchema,
  flexibleProgress,
  goalLabel,
  isScheduled,
  logHabitSchema,
  progressOn,
  statusOn,
  versionOn,
  weekDates,
  type Habit,
  type HabitBundle,
  type HabitLog,
  type HabitStatus,
} from "@/lib/habits/model"
import { HabitForm } from "./habit-form"
import { useHabitTimer } from "./habit-timer-provider"

const colors = {
  orange: "#f97316",
  green: "#22c55e",
  blue: "#3b82f6",
  violet: "#a78bfa",
  rose: "#fb7185",
}
function shortDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00Z`))
}
function unit(habit: Habit, date: string) {
  const config = versionOn(habit, date)?.config
  return config?.goalType === "minutes"
    ? "minutes"
    : config?.goalType === "done"
      ? "completion"
      : (config?.unit ?? "")
}
function Ring({
  amount,
  target,
  color,
}: {
  amount: number
  target: number
  color: string
}) {
  const fraction = Math.min(amount / target, 1)
  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg
        role="img"
        aria-label={`${amount} of ${target}, ${Math.round(fraction * 100)}% complete`}
        className="absolute inset-0 size-16 -rotate-90"
        viewBox="0 0 64 64"
      >
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted"
        />
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={170}
          strokeDashoffset={170 * (1 - fraction)}
          className="transition-all duration-500 motion-reduce:transition-none"
        />
      </svg>
      {fraction === 1 ? (
        <CheckIcon aria-hidden className="size-6" style={{ color }} />
      ) : (
        <span className="text-xs font-medium">
          {Math.round(fraction * 100)}%
        </span>
      )}
    </div>
  )
}
function HabitCard({
  habit,
  bundle,
  onLog,
  onDetails,
}: {
  habit: Habit
  bundle: HabitBundle
  onLog: () => void
  onDetails: () => void
}) {
  const progress = progressOn(habit, bundle.date)
  const timer = useHabitTimer()
  if (!progress) return null
  const { config } = progress.version
  const flex = flexibleProgress(habit, bundle.date)
  return (
    <article
      className="flex min-w-0 flex-wrap items-center gap-4 rounded-xl border bg-card p-4"
      aria-label={habit.name}
    >
      <Ring
        amount={progress.amount}
        target={progress.target}
        color={colors[habit.color]}
      />
      <div className="min-w-[min(100%,12rem)] flex-1">
        <button
          className="flex min-h-11 items-center gap-2 text-left font-medium hover:text-brand focus-visible:outline-2 focus-visible:outline-ring"
          onClick={onDetails}
        >
          <span aria-hidden className="text-xl">
            {habit.icon}
          </span>
          <span className="break-words">{habit.name}</span>
        </button>
        <p className="text-sm text-text-muted">
          {config.goalType === "done"
            ? progress.complete
              ? "Goal met"
              : progress.skipped
                ? "Skipped"
                : "Ready when you are"
            : `${progress.amount} / ${progress.target} ${unit(habit, bundle.date)}`}
          <span className="ml-1">
            ·{" "}
            {config.goalPeriod === "day"
              ? "daily goal"
              : `${config.goalPeriod} goal`}
          </span>
        </p>
        {flex && (
          <p className="mt-1 text-xs text-text-muted">
            {flex.days} / {flex.target} days this week
          </p>
        )}
        {config.times.length > 0 && (
          <p className="mt-1 text-xs text-text-muted">
            Preferred: {config.times.join(" · ")}
          </p>
        )}
        {habit.reason && (
          <p className="mt-2 line-clamp-2 text-xs text-text-muted">
            {habit.reason}
          </p>
        )}
      </div>
      <div className="flex w-full flex-wrap gap-2 xl:w-auto">
        {bundle.date === bundle.today && habit.status === "active" && (
          <Button
            className="h-11"
            variant="outline"
            disabled={!!timer.session || timer.pending}
            onClick={() => timer.chooseHabit(habit)}
          >
            Start timer
          </Button>
        )}
        <Button
          className="h-11"
          variant={progress.complete ? "outline" : "default"}
          disabled={
            bundle.date > bundle.today ||
            statusOn(habit, bundle.date, bundle.today) !== "active"
          }
          onClick={onLog}
        >
          {config.goalType === "done"
            ? progress.complete
              ? "View entry"
              : "Mark done"
            : "Log progress"}
        </Button>
      </div>
    </article>
  )
}
export function HabitsView({
  initialHabitId = null,
  initialDate = "",
}: {
  initialHabitId?: string | null
  initialDate?: string
}) {
  const [date, setDate] = useState(initialDate)
  const query = useHabits(date)
  const [form, setForm] = useState<"new" | string | null>(null)
  const [details, setDetails] = useState<string | null>(initialHabitId)
  const [entry, setEntry] = useState<{
    habitId: string
    log?: HabitLog
  } | null>(null)
  const data = query.data
  const selected = details
    ? data?.items.find((h) => h.id === details)
    : undefined
  const entryHabit = entry
    ? data?.items.find((h) => h.id === entry.habitId)
    : undefined
  const editHabit =
    form && form !== "new" ? data?.items.find((h) => h.id === form) : undefined
  const active =
    data?.items.filter((h) => {
      const p = progressOn(h, data.date)
      return (
        p &&
        (p.complete ||
          (statusOn(h, data.date, data.today) === "active" &&
            (isScheduled(p.version.config, data.date) || p.logs.length > 0)))
      )
    }) ?? []
  const remaining = active.filter((h) => !progressOn(h, data!.date)?.complete)
  const completed = active.filter((h) => progressOn(h, data!.date)?.complete)
  const openLog = (habit: Habit) => {
    const p = progressOn(habit, data!.date)
    if (p?.complete && p.version.config.goalType === "done")
      setDetails(habit.id)
    else setEntry({ habitId: habit.id })
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Habits"
        description="Small efforts. A rhythm of your own."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11"
              variant="outline"
              render={<a href="/api/v1/habits/export" download />}
              nativeButton={false}
            >
              Export CSV
            </Button>
            <Button
              className="h-11"
              disabled={!data}
              onClick={() => setForm("new")}
            >
              <PlusIcon />
              New habit
            </Button>
          </div>
        }
      />
      <QueryFeedback query={query} label="habits" />
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="size-11"
                variant="outline"
                aria-label="Previous day"
                onClick={() => setDate(addDays(data.date, -1))}
              >
                <ChevronLeftIcon />
              </Button>
              <Input
                className="h-11 w-40"
                aria-label="Habit date"
                type="date"
                min="1900-01-01"
                max="2200-12-31"
                value={data.date}
                onChange={(e) => {
                  if (dateSchema.safeParse(e.target.value).success)
                    setDate(e.target.value)
                }}
              />
              <Button
                className="size-11"
                variant="outline"
                aria-label="Next day"
                onClick={() => setDate(addDays(data.date, 1))}
              >
                <ChevronRightIcon />
              </Button>
              <Button
                className="h-11"
                variant="ghost"
                onClick={() => setDate("")}
              >
                Today
              </Button>
            </div>
            <span className="text-xs text-text-muted">
              {data.timezone} · Recorded only when you log
            </span>
          </div>
          {!data.items.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <SproutIcon
                aria-hidden
                className="mx-auto mb-3 size-10 text-brand"
              />
              <h2 className="font-heading text-lg">
                Make room for something that matters
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
                Choose one habit, set a manageable goal, and let your saved
                effort build up.
              </p>
              <Button className="mt-5 h-11" onClick={() => setForm("new")}>
                Create your first habit
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="today">
              <TabsList variant="line" className="!h-12">
                <TabsTrigger className="min-h-11" value="today">
                  Today
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="week">
                  Week
                </TabsTrigger>
                <TabsTrigger className="min-h-11" value="all">
                  All habits
                </TabsTrigger>
              </TabsList>
              <TabsContent value="today" className="space-y-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-medium">
                    {data.date === data.today
                      ? "Your next small step"
                      : shortDate(data.date)}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {completed.length} of {active.length} goals met
                  </p>
                </div>
                {data.date > data.today && (
                  <p className="text-sm text-text-muted">
                    This is your plan. Future days never record progress
                    automatically.
                  </p>
                )}
                <div className="grid gap-3 xl:grid-cols-2">
                  {remaining.map((h) => (
                    <HabitCard
                      key={h.id}
                      habit={h}
                      bundle={data}
                      onLog={() => openLog(h)}
                      onDetails={() => setDetails(h.id)}
                    />
                  ))}
                </div>
                {!remaining.length && (
                  <p className="rounded-xl bg-muted/40 p-4 text-sm text-text-muted">
                    {completed.length
                      ? "Your saved effort is here to stay. Enjoy the room you've made for yourself."
                      : "No habits planned for this day. Rest days belong in your rhythm too."}
                  </p>
                )}
                {!!completed.length && (
                  <section aria-label="Completed goals" className="space-y-3">
                    <h2 className="flex items-center gap-2 font-medium">
                      <CheckIcon
                        aria-hidden
                        className="size-4 text-green-500"
                      />
                      Goals met · {completed.length}
                    </h2>
                    <div className="grid gap-3 xl:grid-cols-2">
                      {completed.map((h) => (
                        <HabitCard
                          key={h.id}
                          habit={h}
                          bundle={data}
                          onLog={() => openLog(h)}
                          onDetails={() => setDetails(h.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </TabsContent>
              <TabsContent value="week" className="space-y-4">
                <p className="text-sm text-text-muted">
                  {shortDate(weekDates(data.date, data.weekStart)[0])} –{" "}
                  {shortDate(weekDates(data.date, data.weekStart)[6])} · Tap a
                  day to view or log it.
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                  <span>✓ Goal met</span>
                  <span>◐ Some progress</span>
                  <span>— Rest or paused</span>
                  <span>↷ Skipped</span>
                  <span>○ Planned</span>
                </div>
                {data.items
                  .filter(
                    (h) =>
                      h.status !== "archived" || h.logs.some((l) => !l.deleted)
                  )
                  .map((h) => (
                    <WeekRow
                      key={h.id}
                      habit={h}
                      bundle={data}
                      onDate={setDate}
                      onDetails={() => setDetails(h.id)}
                    />
                  ))}
              </TabsContent>
              <TabsContent value="all" className="space-y-3">
                <p className="text-sm text-text-muted">
                  Open a habit to edit it, pause, archive, restart, or browse
                  its entries.
                </p>
                {data.items.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setDetails(h.id)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card p-4 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span aria-hidden className="text-2xl">
                      {h.icon}
                    </span>
                    <span className="min-w-0 flex-1 font-medium break-words">
                      {h.name}
                      <span className="mt-1 block text-xs font-normal text-text-muted">
                        {goalLabel(h.versions.at(-1)!.config)}
                      </span>
                    </span>
                    <span className="rounded-full border px-2 py-1 text-xs capitalize">
                      {h.status}
                    </span>
                  </button>
                ))}
              </TabsContent>
            </Tabs>
          )}
          {form && (
            <HabitForm
              key={form}
              habit={editHabit}
              today={data.today}
              weekStart={data.weekStart}
              onClose={() => setForm(null)}
            />
          )}
          {selected && (
            <HabitDetails
              habit={selected}
              bundle={data}
              onClose={() => setDetails(null)}
              onEdit={() => {
                setDetails(null)
                setForm(selected.id)
              }}
              onLog={(log) => {
                setDetails(null)
                setEntry({ habitId: selected.id, log })
              }}
              onDate={setDate}
            />
          )}
          {entry && entryHabit && (
            <LogDialog
              key={entry.log?.id ?? `${entryHabit.id}:${data.date}`}
              habit={entryHabit}
              bundle={data}
              log={entry.log}
              onClose={() => setEntry(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
function WeekRow({
  habit,
  bundle,
  onDate,
  onDetails,
}: {
  habit: Habit
  bundle: HabitBundle
  onDate: (date: string) => void
  onDetails: () => void
}) {
  const flex = flexibleProgress(habit, bundle.date)
  const periodProgress = progressOn(habit, bundle.date)
  return (
    <article
      aria-label={`${habit.name} week`}
      className="min-w-0 rounded-xl border bg-card p-4"
    >
      <button
        onClick={onDetails}
        className="min-h-11 text-left font-medium hover:text-brand focus-visible:outline-2 focus-visible:outline-ring"
      >
        {habit.icon} {habit.name}
      </button>
      {flex && (
        <p className="mb-3 text-xs text-text-muted">
          {flex.days} / {flex.target} completed days · choose your days
        </p>
      )}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {weekDates(bundle.date, bundle.weekStart).map((date) => {
          const p = progressOn(habit, date)
          const due =
            p &&
            isScheduled(p.version.config, date) &&
            statusOn(habit, date, bundle.today) === "active"
          const dayLogs = habit.logs.filter(
            (log) => !log.deleted && log.date === date
          )
          const dayAmount = dayLogs.reduce(
            (sum, log) => sum + (log.kind === "progress" ? log.amount : 0),
            0
          )
          const recorded = dayAmount > 0
          const complete = p?.version.config.goalPeriod === "day" && p.complete
          const skipped =
            !recorded && dayLogs.some((log) => log.kind === "skip")
          const label = complete
            ? "Goal met"
            : skipped
              ? "Skipped"
              : recorded
                ? `${dayAmount} ${unit(habit, date)} recorded`
                : !due
                  ? "Rest or paused"
                  : p?.version.config.schedule === "flexible"
                    ? "Available day"
                    : "Planned"
          return (
            <button
              key={date}
              aria-label={`${habit.name}, ${date}, ${label}`}
              onClick={() => onDate(date)}
              className={cn(
                "flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border text-xs focus-visible:outline-2 focus-visible:outline-ring",
                date === bundle.date && "ring-1 ring-brand",
                complete
                  ? "border-green-500/30 bg-green-500/10"
                  : recorded
                    ? "bg-brand-soft"
                    : "bg-muted/20"
              )}
            >
              <span className="text-text-muted">
                {new Intl.DateTimeFormat("en", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(`${date}T12:00Z`))}
              </span>
              <span>{date.slice(8)}</span>
              <span
                style={{
                  color: complete
                    ? colors.green
                    : recorded
                      ? colors[habit.color]
                      : undefined,
                }}
              >
                {complete
                  ? "✓"
                  : skipped
                    ? "↷"
                    : recorded
                      ? "◐"
                      : !due
                        ? "—"
                        : "○"}
              </span>
            </button>
          )
        })}
      </div>
      {!flex && (
        <p className="mt-3 text-xs text-text-muted">
          {goalLabel(
            versionOn(habit, bundle.date)?.config ??
              habit.versions.at(-1)!.config
          )}
          {periodProgress &&
            periodProgress.version.config.goalPeriod !== "day" &&
            ` · ${periodProgress.amount} / ${periodProgress.target} ${unit(habit, bundle.date)}${periodProgress.complete ? " · Goal met" : ""}`}
        </p>
      )}
    </article>
  )
}
function HabitDetails({
  habit,
  bundle,
  onClose,
  onEdit,
  onLog,
  onDate,
}: {
  habit: Habit
  bundle: HabitBundle
  onClose: () => void
  onEdit: () => void
  onLog: (log?: HabitLog) => void
  onDate: (date: string) => void
}) {
  const status = useHabitWrite("habit.status")
  const timer = useHabitTimer()
  const correct = useHabitWrite("habit.correct")
  const current = progressOn(habit, bundle.date)
  const logs = habit.logs
    .filter((l) => !l.deleted && l.date.slice(0, 7) === bundle.date.slice(0, 7))
    .reverse()
  const pending = habit.versions.at(-1)!
  async function changeStatus(next: HabitStatus) {
    try {
      await status.mutateAsync({
        id: habit.id,
        path: `/${habit.id}/status`,
        method: "PATCH",
        body: { status: next, expectedRevision: habit.revision },
      })
      showToast(
        next === "active"
          ? "Habit restarted"
          : next === "paused"
            ? "Habit paused"
            : "Habit archived",
        { description: "Your earlier effort stays saved." },
        "success"
      )
      onClose()
    } catch {}
  }
  async function remove(log: HabitLog) {
    try {
      const result = await correct.mutateAsync({
        id: habit.id,
        path: `/${habit.id}/logs/${log.id}`,
        method: "PATCH",
        body: { deleted: true, expectedRevision: log.revision },
      })
      showToast("Entry removed", {
        id: `habit:${habit.id}:entry`,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await correct.mutateAsync({
                id: habit.id,
                path: `/${habit.id}/logs/${log.id}`,
                method: "PATCH",
                body: {
                  deleted: false,
                  expectedRevision: result.log!.revision,
                },
              })
            } catch {}
          },
        },
      })
    } catch {}
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !status.isPending && !correct.isPending) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {habit.icon} {habit.name}
          </DialogTitle>
          <DialogDescription>
            {habit.reason || "Every saved effort is part of your habit."}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-text-muted">
          {goalLabel(current?.version.config ?? pending.config)} ·{" "}
          {habit.status}
        </p>
        {pending.effectiveFrom > bundle.today && (
          <p className="rounded-lg bg-muted/40 p-3 text-sm">
            Updated goal and schedule begin {pending.effectiveFrom}:{" "}
            {goalLabel(pending.config)}.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {habit.status === "active" &&
            bundle.date === bundle.today &&
            current && (
              <Button
                className="h-11"
                disabled={!!timer.session || timer.pending}
                onClick={() => {
                  onClose()
                  timer.chooseHabit(habit)
                }}
              >
                Start timer
              </Button>
            )}
          <Button
            className="h-11"
            variant="outline"
            onClick={onEdit}
            disabled={status.isPending || correct.isPending}
          >
            Edit habit
          </Button>
          <Button
            className="h-11"
            variant="outline"
            disabled={status.isPending || correct.isPending}
            onClick={() =>
              void changeStatus(habit.status === "active" ? "paused" : "active")
            }
          >
            {habit.status === "active" ? "Pause" : "Restart"}
          </Button>
          {habit.status !== "archived" && (
            <Button
              className="h-11"
              variant="ghost"
              disabled={status.isPending || correct.isPending}
              onClick={() => void changeStatus("archived")}
            >
              Archive
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">
            Saved effort · {bundle.date.slice(0, 7)}
          </h3>
          <Input
            className="h-11 w-40"
            aria-label="History date"
            type="date"
            value={bundle.date}
            onChange={(e) => {
              if (dateSchema.safeParse(e.target.value).success)
                onDate(e.target.value)
            }}
          />
        </div>
        <p className="text-xs text-text-muted">
          Choose a date to browse its month. Manual entries only; planned time
          adds nothing.
        </p>
        {current &&
          bundle.date <= bundle.today &&
          statusOn(habit, bundle.date, bundle.today) === "active" && (
            <Button
              className="h-11"
              onClick={() => onLog()}
              disabled={
                status.isPending ||
                correct.isPending ||
                (current.complete && current.version.config.goalType === "done")
              }
            >
              Log for {shortDate(bundle.date)}
            </Button>
          )}
        {!logs.length && (
          <p className="py-4 text-sm text-text-muted">
            No entries in this month yet.
          </p>
        )}
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {shortDate(log.date)} ·{" "}
                  {log.source === "timer"
                    ? `${Math.round((log.elapsedMs ?? 0) / 60) / 1000} minutes · timer${log.kind === "progress" && unit(habit, log.date) !== "minutes" ? ` · ${log.amount} ${unit(habit, log.date)}` : ""}`
                    : log.kind === "skip"
                      ? "Skipped"
                      : `${log.amount} ${unit(habit, log.date)}`}
                </p>
                <div className="flex gap-1">
                  {log.kind === "progress" && (
                    <Button
                      className="h-11"
                      variant="ghost"
                      disabled={correct.isPending || status.isPending}
                      onClick={() => onLog(log)}
                    >
                      Edit entry
                    </Button>
                  )}
                  <Button
                    className="h-11"
                    variant="ghost"
                    disabled={correct.isPending || status.isPending}
                    onClick={() => void remove(log)}
                  >
                    Delete entry
                  </Button>
                </div>
              </div>
              {log.notes && (
                <p className="mt-1 text-sm break-words whitespace-pre-wrap text-text-muted">
                  {log.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
export function LogDialog({
  habit,
  bundle,
  log,
  onClose,
}: {
  habit: Habit
  bundle: HabitBundle
  log?: HabitLog
  onClose: () => void
}) {
  const [date, setDate] = useState(log?.date ?? bundle.date)
  const datedQuery = useHabits(date, date !== bundle.date)
  const recordingHabit =
    date === bundle.date
      ? habit
      : datedQuery.data?.items.find((item) => item.id === habit.id)
  const progress = recordingHabit ? progressOn(recordingHabit, date) : null
  const config = versionOn(habit, date)?.config
  const [amount, setAmount] = useState(
    log?.amount ?? (config?.goalType === "done" ? 1 : (config?.target ?? 1))
  )
  const [notes, setNotes] = useState(log?.notes ?? "")
  const [error, setError] = useState("")
  const [id] = useState(() => crypto.randomUUID())
  const save = useHabitWrite(log ? "habit.correct" : "habit.log")
  const undo = useHabitWrite("habit.correct")
  async function submit(kind: "progress" | "skip") {
    const parsed = logHabitSchema.safeParse({
      id,
      date,
      kind,
      amount: kind === "skip" ? 0 : config?.goalType === "done" ? 1 : amount,
      notes,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check this entry")
      return
    }
    if (!config || !recordingHabit) {
      setError("Choose a date within the habit's schedule")
      return
    }
    setError("")
    try {
      const result = await save.mutateAsync({
        id: habit.id,
        path: log ? `/${habit.id}/logs/${log.id}` : `/${habit.id}/logs`,
        method: log ? "PATCH" : "POST",
        body: log
          ? {
              amount: parsed.data.amount,
              notes,
              expectedRevision: log.revision,
            }
          : parsed.data,
      })
      if (log || result.created) {
        const total =
          result.progress?.amount ??
          (progress?.amount ?? 0) +
            (kind === "skip" ? 0 : parsed.data.amount) -
            (log?.amount ?? 0)
        const message = log
          ? "Entry corrected"
          : kind === "skip"
            ? "Skipped — your earlier effort stays saved"
            : result.completed
              ? `${habit.name}: goal met!`
              : config.goalType === "done"
                ? "Done. A small step worth keeping."
                : `${parsed.data.amount} ${unit(habit, date)} added — ${Math.round(Math.max(config.target - total, 0) * 1000) / 1000} to go`
        showToast(
          message,
          {
            id: `habit:${habit.id}:entry`,
            description: result.completed
              ? "You made time for something that matters."
              : undefined,
            action: !log
              ? {
                  label: "Undo",
                  onClick: async () => {
                    try {
                      await undo.mutateAsync({
                        id: habit.id,
                        path: `/${habit.id}/logs/${result.log!.id}`,
                        method: "PATCH",
                        body: {
                          deleted: true,
                          expectedRevision: result.log!.revision,
                        },
                      })
                    } catch {}
                  },
                }
              : undefined,
          },
          "success"
        )
      }
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save entry")
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose()
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        showCloseButton={!save.isPending}
      >
        <DialogHeader>
          <DialogTitle>
            {log ? "Edit entry" : "Log progress"} · {habit.name}
          </DialogTitle>
          <DialogDescription>
            Record what you actually did. Every bit of effort counts.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit("progress")
          }}
        >
          {date !== bundle.date && (
            <QueryFeedback query={datedQuery} label="this date's progress" />
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            Entry date
            <Input
              className="h-11"
              type="date"
              required
              max={bundle.today}
              value={date}
              disabled={!!log}
              onChange={(e) => {
                if (dateSchema.safeParse(e.target.value).success)
                  setDate(e.target.value)
              }}
            />
          </label>
          {config?.goalType !== "done" && (
            <label className="grid gap-1.5 text-sm font-medium">
              Amount ({unit(habit, date)})
              <Input
                className="h-11"
                type="number"
                required
                min="0.001"
                step="0.001"
                max="1000000"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
          )}
          {config && (
            <p className="text-xs text-text-muted">
              {goalLabel(config)} · {progress?.amount ?? 0} recorded in this
              period
            </p>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            Note (optional)
            <Textarea
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it feel? What did you work on?"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {!log && (
              <Button
                className="h-11"
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => void submit("skip")}
              >
                Skip this period
              </Button>
            )}
            <Button
              className="h-11"
              type="button"
              variant="outline"
              disabled={save.isPending || !recordingHabit}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="h-11"
              type="submit"
              loading={save.isPending}
              disabled={!recordingHabit}
            >
              {log
                ? "Save correction"
                : config?.goalType === "done"
                  ? "Save completion"
                  : "Save progress"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
