"use client"
import { createContext, useContext, useState, type ReactNode } from "react"
import Link from "next/link"
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
import { useHabits, useHabitWrite } from "@/hooks/queries/habits"
import { goalLabel, progressOn, statusOn, versionOn } from "@/lib/habits/model"
import {
  habitPlanSchema,
  recordedMinutes,
  type HabitCalendarBlock,
} from "@/lib/habits/planning"
import { showToast } from "@/lib/toast"
import { useHabitTimer } from "./habit-timer-provider"
import { LogDialog } from "./habits-view"
import { controlClass } from "./habit-form"

type PlanRequest = {
  habitId?: string
  block?: HabitCalendarBlock
  date?: string
  time?: string | null
  minutes?: number
}
type Actions = {
  userId: string
  openHabit: (
    habitId: string,
    date?: string,
    block?: HabitCalendarBlock
  ) => void
  openPlan: (request?: PlanRequest) => void
}
const Context = createContext<Actions | null>(null)
export function useHabitActions() {
  const context = useContext(Context)
  if (!context) throw new Error("Habit actions provider is missing")
  return context
}
export function HabitActionsProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  const [selection, setSelection] = useState<{
    habitId: string
    date: string
    block?: HabitCalendarBlock
  } | null>(null)
  const [plan, setPlan] = useState<PlanRequest | null>(null)
  return (
    <Context.Provider
      value={{
        userId,
        openHabit: (habitId, date = "", block) =>
          setSelection({ habitId, date, block }),
        openPlan: (request = {}) => setPlan(request),
      }}
    >
      {children}
      {selection && (
        <HabitActionDialog
          key={`${selection.habitId}:${selection.date}`}
          {...selection}
          onClose={() => setSelection(null)}
          onPlan={() => {
            setPlan({
              habitId: selection.habitId,
              block: selection.block,
              date: selection.date,
            })
            setSelection(null)
          }}
        />
      )}
      {plan && <HabitPlanDialog request={plan} onClose={() => setPlan(null)} />}
    </Context.Provider>
  )
}
function HabitActionDialog({
  habitId,
  date,
  block,
  onClose,
  onPlan,
}: {
  habitId: string
  date: string
  block?: HabitCalendarBlock
  onClose: () => void
  onPlan: () => void
}) {
  const query = useHabits(date),
    timer = useHabitTimer()
  const [logging, setLogging] = useState(false)
  const bundle = query.data,
    habit = bundle?.items.find((h) => h.id === habitId)
  const progress = habit && bundle ? progressOn(habit, bundle.date) : null
  const canLog =
    habit &&
    bundle &&
    progress &&
    bundle.date <= bundle.today &&
    statusOn(habit, bundle.date, bundle.today) === "active"
  if (logging && habit && bundle)
    return <LogDialog habit={habit} bundle={bundle} onClose={onClose} />
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {habit ? `${habit.icon} ${habit.name}` : "Habit"}
          </DialogTitle>
          <DialogDescription>
            {habit?.reason || "Make room for something that matters."}
          </DialogDescription>
        </DialogHeader>
        <QueryFeedback query={query} label="habit" />
        {bundle && habit && (
          <div className="grid gap-4">
            <p className="text-sm text-text-muted">
              {bundle.date} · {bundle.timezone}
            </p>
            {progress && (
              <>
                <p className="font-medium">
                  {goalLabel(progress.version.config)}
                </p>
                <p className="text-sm">
                  {progress.amount} / {progress.target}{" "}
                  {progress.version.config.goalType === "minutes"
                    ? "minutes"
                    : progress.version.config.unit || "done"}
                  {progress.complete
                    ? " · Goal met ✓"
                    : progress.skipped
                      ? " · Skipped"
                      : ""}
                </p>
              </>
            )}
            <p className="rounded-lg border bg-muted/20 p-3 text-sm">
              {block ? `${block.minutes} min planned · ` : ""}
              {recordedMinutes(habit, bundle.date)} min recorded on this day
            </p>
            <p className="text-xs text-text-muted">
              Planned time is a prompt. Only starting a timer and saving its
              work, or logging what you did, records progress.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-11"
                disabled={
                  habit.status !== "active" ||
                  bundle.date !== bundle.today ||
                  !progress ||
                  !!timer.session ||
                  timer.pending
                }
                onClick={() => {
                  onClose()
                  timer.chooseHabit(habit)
                }}
              >
                Start timer
              </Button>
              <Button
                className="h-11"
                variant="outline"
                disabled={
                  !canLog ||
                  (progress?.complete &&
                    progress.version.config.goalType === "done")
                }
                onClick={() => setLogging(true)}
              >
                {progress?.version.config.goalType === "done"
                  ? "Mark done"
                  : "Log progress"}
              </Button>
              <Button
                className="h-11"
                variant="ghost"
                disabled={
                  habit.status !== "active" || (!!block && !block.editable)
                }
                onClick={onPlan}
              >
                {block ? "Change plan" : "Plan a day"}
              </Button>
            </div>
            {bundle.date > bundle.today && (
              <p className="text-xs text-text-muted">
                This is a future plan. Start or record work on the day you do
                it.
              </p>
            )}
            <Link
              className="inline-flex min-h-11 items-center text-sm text-brand"
              href={`/habits?h=${habit.id}&date=${bundle.date}`}
              onClick={onClose}
            >
              Open habit history →
            </Link>
          </div>
        )}
        {bundle && !habit && (
          <p role="status">This habit is no longer available.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
function HabitPlanDialog({
  request,
  onClose,
}: {
  request: PlanRequest
  onClose: () => void
}) {
  const query = useHabits(request.date ?? ""),
    save = useHabitWrite("habit.plan")
  const [habitId, setHabitId] = useState(request.habitId ?? "")
  const [date, setDate] = useState(request.date ?? request.block?.date ?? "")
  const [time, setTime] = useState(request.time ?? request.block?.time ?? "")
  const [minutes, setMinutes] = useState<number | null>(
    request.minutes ?? request.block?.minutes ?? null
  )
  const [scope, setScope] = useState<"this" | "following">("this")
  const [error, setError] = useState("")
  const [id] = useState(() => crypto.randomUUID())
  const bundle = query.data,
    active = bundle?.items.filter((h) => h.status === "active") ?? []
  const habit = active.find((h) => h.id === (habitId || active[0]?.id)),
    block = request.block
  async function submit(canceled = false) {
    if (!habit || !bundle) return
    const parsed = habitPlanSchema.safeParse({
      id,
      expectedRevision: habit.revision,
      date: date || bundle.today,
      time: time || null,
      minutes:
        minutes ??
        (habit &&
          versionOn(habit, date || bundle.today)?.config.defaultDuration) ??
        30,
      ...(block
        ? {
            scope: canceled ? "this" : scope,
            versionId: block.versionId,
            sourceDate: block.sourceDate,
            sourceSlot: block.sourceSlot,
            canceled,
          }
        : { scope: "extra" }),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the plan")
      return
    }
    try {
      await save.mutateAsync({
        id: habit.id,
        path: `/${habit.id}/plans`,
        method: "POST",
        body: parsed.data,
      })
      showToast(
        canceled ? "Planned occurrence removed" : "Habit plan saved",
        { description: "Recorded progress stays unchanged." },
        "success"
      )
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't save the plan"
      )
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
            {block ? "Change habit plan" : "Plan a habit"}
          </DialogTitle>
          <DialogDescription>
            Choose when to make room for the habit. Saving a plan records no
            work.
          </DialogDescription>
        </DialogHeader>
        <QueryFeedback query={query} label="habits" />
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {!request.habitId && (
            <label className="grid gap-1.5 text-sm">
              Habit
              <select
                className={controlClass}
                value={habit?.id ?? ""}
                onChange={(e) => {
                  setHabitId(e.target.value)
                  const selected = active.find((h) => h.id === e.target.value)
                  if (selected)
                    setMinutes(
                      versionOn(selected, bundle!.today)?.config
                        .defaultDuration ?? 30
                    )
                }}
              >
                {active.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.icon} {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {request.habitId && habit && (
            <p className="font-medium">
              {habit.icon} {habit.name}
            </p>
          )}
          <label className="grid gap-1.5 text-sm">
            Planned date
            <Input
              className="h-11"
              type="date"
              min={bundle?.today}
              max="2200-12-31"
              required
              value={date || bundle?.today || ""}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Time (leave empty for all day)
            <Input
              className="h-11"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Planned minutes
            <Input
              className="h-11"
              type="number"
              min={1}
              max={1440}
              step={1}
              required
              value={
                minutes ??
                (habit &&
                  versionOn(habit, date || bundle?.today || "")?.config
                    .defaultDuration) ??
                30
              }
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          {block && !block.sourceSlot.startsWith("extra:") && (
            <label className="grid gap-1.5 text-sm">
              Apply change to
              <select
                className={controlClass}
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="this">This occurrence</option>
                <option value="following">This and future occurrences</option>
              </select>
            </label>
          )}
          {scope === "following" && (
            <p className="text-xs text-text-muted">
              Shift future dates and this time slot until the habit&apos;s next
              schedule version. Other time slots and recorded days keep their
              plans.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {block && (
              <Button
                className="h-11"
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => void submit(true)}
              >
                Remove this occurrence
              </Button>
            )}
            <Button
              className="h-11"
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="h-11"
              type="submit"
              loading={save.isPending}
              disabled={!habit}
            >
              Save plan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
