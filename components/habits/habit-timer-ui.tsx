"use client"
import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Maximize2Icon, PauseIcon, PlayIcon } from "lucide-react"
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
import { useHabitTimer } from "./habit-timer-provider"
import {
  formatTimer,
  isActiveTimer,
  MAX_TIMER_MS,
  timerElapsed,
  timerPhaseRemaining,
  type TimerMode,
} from "@/lib/habits/timer"
import { todayIn, versionOn } from "@/lib/habits/model"
import { useSettings } from "@/hooks/queries/settings"
import { controlClass } from "./habit-form"
import { HabitNudge } from "./habit-motivation"
import { useHabitPreferences } from "@/hooks/queries/habits"

type PiPWindowApi = {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>
}
function pipApi() {
  return (window as Window & { documentPictureInPicture?: PiPWindowApi })
    .documentPictureInPicture
}
const subscribeNoop = () => () => {}
export function HabitTimerUI() {
  const timer = useHabitTimer()
  const [popup, setPopup] = useState<Window | null>(null)
  const [pipError, setPipError] = useState("")
  const supported = useSyncExternalStore(
    subscribeNoop,
    () => window.isSecureContext && !!pipApi(),
    () => false
  )
  useEffect(() => {
    if (!popup) return
    const returnToApp = () => setPopup(null)
    popup.addEventListener("pagehide", returnToApp)
    return () => {
      popup.removeEventListener("pagehide", returnToApp)
      if (!popup.closed) popup.close()
    }
  }, [popup])
  useEffect(() => {
    if (!timer.session && popup) popup.close()
  }, [timer.session, popup])
  async function popOut() {
    setPipError("")
    try {
      const api = pipApi()
      if (!api)
        throw new Error(
          "Pop-out is unavailable in this browser. Your timer stays here."
        )
      const next = await api.requestWindow({ width: 400, height: 460 })
      next.document.title = "Habit timer"
      const base = next.document.createElement("base")
      base.href = document.baseURI
      next.document.head.append(base)
      next.document.documentElement.className =
        document.documentElement.className
      for (const sheet of document.styleSheets) {
        try {
          const style = next.document.createElement("style")
          style.textContent = Array.from(
            sheet.cssRules,
            (rule) => rule.cssText
          ).join("\n")
          next.document.head.append(style)
        } catch {
          if (sheet.href) {
            const link = next.document.createElement("link")
            link.rel = "stylesheet"
            link.href = sheet.href
            next.document.head.append(link)
          }
        }
      }
      next.document.body.className = "bg-background text-foreground p-4"
      setPopup(next)
    } catch (cause) {
      setPipError(
        cause instanceof Error
          ? cause.message
          : "Pop-out could not open. Your timer stays here."
      )
    }
  }
  return (
    <>
      {timer.startHabit && <StartDialog key={timer.startHabit.id} />}
      {timer.session && (
        <>
          {popup ? (
            createPortal(
              <TimerPanel pip onPopOut={() => popup.close()} supported />,
              popup.document.body
            )
          ) : (
            <aside
              aria-label="Habit timer"
              className="fixed right-4 bottom-24 z-40 max-h-[calc(100dvh-8rem)] w-[380px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl border bg-card p-4 shadow-xl md:bottom-4 md:max-h-[calc(100dvh-2rem)]"
            >
              <TimerPanel
                supported={supported}
                onPopOut={() => void popOut()}
              />
              {pipError && (
                <p role="status" className="mt-2 text-xs text-text-muted">
                  {pipError}
                </p>
              )}
            </aside>
          )}
          {popup && (
            <aside
              aria-label="Timer in pop-out"
              className="fixed right-4 bottom-24 z-40 max-w-[calc(100%-2rem)] rounded-xl border bg-card p-3 shadow-xl md:bottom-4"
            >
              <p className="text-sm">
                {timer.session.name} · Timer is popped out
              </p>
              <Button
                className="mt-2 h-11"
                variant="outline"
                onClick={() => popup.close()}
              >
                Bring timer back
              </Button>
            </aside>
          )}
        </>
      )}
    </>
  )
}
function StartDialog() {
  const timer = useHabitTimer()
  const habit = timer.startHabit!
  const { data: settings } = useSettings()
  const current =
    versionOn(habit, todayIn(settings?.timezone ?? "UTC")) ??
    habit.versions.at(-1)!
  const [mode, setMode] = useState<TimerMode>("countdown")
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [rounds, setRounds] = useState(4)
  const [minutes, setMinutes] = useState(
    habit.lastTimerMinutes ?? current.config.defaultDuration
  )
  const [error, setError] = useState("")
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !timer.busy) timer.chooseHabit(null)
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        showCloseButton={!timer.busy}
      >
        <DialogHeader>
          <DialogTitle>Start · {habit.name}</DialogTitle>
          <DialogDescription>
            {habit.reason || "Choose a session you can make room for."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setError("")
            try {
              await timer.start(
                habit,
                mode,
                minutes,
                mode === "pomodoro" ? { breakMinutes, rounds } : undefined
              )
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Couldn't start timer"
              )
            }
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Timer mode
            <select
              className={controlClass}
              value={mode}
              onChange={(e) => {
                const nextMode = e.target.value as TimerMode
                setMode(nextMode)
                if (nextMode === "pomodoro")
                  setMinutes((value) => Math.min(value, 120))
              }}
            >
              <option value="countdown">Countdown</option>
              <option value="stopwatch">Stopwatch</option>
              <option value="pomodoro">Pomodoro · work and breaks</option>
            </select>
          </label>
          {mode !== "stopwatch" && (
            <label className="grid gap-1.5 text-sm font-medium">
              {mode === "pomodoro"
                ? "Work minutes per round"
                : "Session minutes"}
              <Input
                className="h-11"
                type="number"
                min={1}
                max={mode === "pomodoro" ? 120 : 1440}
                step={1}
                required
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          )}
          {mode === "pomodoro" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-medium">
                  Break minutes
                  <Input
                    className="h-11"
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    required
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Work rounds
                  <Input
                    className="h-11"
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    required
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                  />
                </label>
              </div>
              <p className="text-xs text-text-muted">
                {minutes * rounds} planned working minutes. Start each break and
                next round when ready. Breaks and gaps after a phase ends never
                count as work.
              </p>
            </>
          )}
          <HabitNudge habitId={habit.id} hasReason={!!habit.reason} />
          <p className="text-xs text-text-muted">
            Time is recorded only after you finish and confirm it.
            {current.config.goalType !== "minutes" &&
              " Log quantity or mark done separately; the timer records your working time."}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              className="h-11"
              type="button"
              variant="outline"
              disabled={timer.busy}
              onClick={() => timer.chooseHabit(null)}
            >
              Cancel
            </Button>
            <Button
              className="h-11"
              type="submit"
              loading={timer.busy}
              disabled={!timer.online || !!timer.session || timer.pending}
            >
              <PlayIcon />
              Start timer
            </Button>
          </div>
          {!timer.online && (
            <p className="text-xs text-text-muted">
              Connect to start a session.
            </p>
          )}
          {timer.session && (
            <p className="text-xs text-text-muted">
              Finish or discard your active session first.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
function TimerPanel({
  pip = false,
  supported,
  onPopOut,
}: {
  pip?: boolean
  supported: boolean
  onPopOut: () => void
}) {
  const timer = useHabitTimer()
  const session = timer.session!
  const preferences = useHabitPreferences().data
  const [discard, setDiscard] = useState(false)
  const elapsed = timerElapsed(session, timer.now)
  const remaining = timerPhaseRemaining(session, timer.now)
  const expired = remaining <= 0
  const cycle = session.pomodoro
  const disabled = timer.conflict || !isActiveTimer(session.status)
  return (
    <div className="grid gap-3" aria-label={pip ? "Habit timer" : undefined}>
      {preferences?.nudges && !preferences.quiet && elapsed >= 300000 && (
        <p
          className="text-xs text-text-muted"
          aria-label="Session encouragement"
        >
          {Math.floor(elapsed / 60000)} minutes of working time. Finish when you
          are ready; review and save to keep it.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">
          {session.icon} {session.name}
        </p>
        <Button
          size="icon"
          className="size-11 shrink-0"
          variant="ghost"
          aria-label={pip ? "Bring timer back" : "Pop out timer"}
          disabled={!supported}
          onClick={onPopOut}
        >
          <Maximize2Icon />
        </Button>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span
          role="timer"
          aria-live="off"
          aria-label={
            cycle?.phase === "break"
              ? "Break remaining"
              : session.mode !== "stopwatch"
                ? "Remaining time"
                : "Elapsed time"
          }
          className="font-heading text-4xl font-medium tabular-nums"
        >
          {formatTimer(session.mode !== "stopwatch" ? remaining : elapsed)}
        </span>
        <span className="text-xs text-text-muted">
          {session.status === "review"
            ? "Review work"
            : session.status === "running"
              ? expired
                ? "Time's up"
                : session.mode
              : session.status === "finished"
                ? "Waiting to sync"
                : session.status === "discarded"
                  ? "Discard pending"
                  : "Paused"}
        </span>
      </div>
      {cycle && (
        <div className="space-y-1 text-xs text-text-muted">
          <p role="status">
            {cycle.phase === "break" ? "Break" : "Work"} · Round {cycle.round}{" "}
            of {cycle.rounds}
            {expired ? " · Phase finished" : ""}
          </p>
          <p>
            {formatTimer(elapsed)} working time so far. Breaks are excluded.
          </p>
        </div>
      )}
      {timer.recovered && isActiveTimer(session.status) && (
        <p className="text-xs text-text-muted">
          Recovered or synced timer. Review elapsed work before saving.
        </p>
      )}
      {session.status === "review" && !timer.conflict ? (
        <ReviewSession key={session.id} />
      ) : (
        isActiveTimer(session.status) && (
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11"
              variant="outline"
              disabled={
                disabled ||
                (session.status !== "running" && expired) ||
                (!expired &&
                  session.status !== "running" &&
                  elapsed >= MAX_TIMER_MS)
              }
              onClick={() =>
                timer.command({
                  action: session.status === "running" ? "pause" : "resume",
                })
              }
            >
              {session.status === "running" ? <PauseIcon /> : <PlayIcon />}
              {session.status === "running" ? "Pause" : "Resume"}
            </Button>
            {cycle &&
              (cycle.phase === "break" ||
                (expired && cycle.round < cycle.rounds)) && (
                <Button
                  className="h-11"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => timer.command({ action: "next_phase" })}
                >
                  {cycle.phase === "work"
                    ? "Start break"
                    : expired
                      ? "Start next round"
                      : "Skip break · start next round"}
                </Button>
              )}
            {session.mode === "countdown" && (
              <Button
                className="h-11"
                variant="outline"
                disabled={disabled || session.targetMs + 300000 > MAX_TIMER_MS}
                onClick={() =>
                  timer.command({ action: "add_time", minutes: 5 })
                }
              >
                +5 min
              </Button>
            )}
            <Button
              className="h-11"
              disabled={disabled}
              onClick={() => timer.command({ action: "review" })}
            >
              Finish
            </Button>
            <Button
              className="h-11"
              variant="ghost"
              disabled={disabled}
              onClick={() => setDiscard(true)}
            >
              Discard
            </Button>
          </div>
        )
      )}
      {discard && (
        <div className="rounded-lg border p-3 text-sm">
          <p>Discard this session? No time will be recorded.</p>
          <div className="mt-2 flex gap-2">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => setDiscard(false)}
            >
              Keep session
            </Button>
            <Button
              className="h-11"
              variant="destructive"
              onClick={() => {
                timer.command({ action: "discard" })
                setDiscard(false)
              }}
            >
              Discard session
            </Button>
          </div>
        </div>
      )}
      {(timer.notice || timer.pending || !timer.online) && (
        <p role="status" className="text-xs text-text-muted">
          {timer.notice ||
            (timer.online
              ? "Syncing timer change…"
              : "Offline. Timer changes are kept on this device.")}
        </p>
      )}
      {timer.conflict && (
        <div className="grid gap-2 rounded-lg border p-3 text-xs">
          {timer.unsentFinish && (
            <p>
              Unsent work: {formatTimer(timer.unsentFinish.confirmedMs)}.
              {timer.unsentFinish.notes && ` Note: ${timer.unsentFinish.notes}`}
            </p>
          )}
          <p>
            Save a copy of your unsent work before switching. Using the latest
            timer clears these unsent changes; it does not record them.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11"
              variant="outline"
              onClick={timer.downloadDraft}
            >
              Save unsent copy
            </Button>
            <Button
              className="h-11"
              variant="outline"
              loading={timer.busy}
              disabled={!timer.online}
              onClick={timer.reviewLatest}
            >
              Use latest timer
            </Button>
          </div>
        </div>
      )}
      {!supported && (
        <p className="text-xs text-text-muted">
          Pop-out is unavailable here. This timer stays visible in the app.
        </p>
      )}
    </div>
  )
}
function ReviewSession() {
  const timer = useHabitTimer(),
    session = timer.session!
  const tracked = timerElapsed(session, timer.now)
  const [confirmed, setConfirmed] = useState(Math.floor(tracked / 60) / 1000)
  const [notes, setNotes] = useState("")
  const confirmedMs = Math.round(confirmed * 60000)
  const valid = confirmedMs >= 1000 && confirmedMs <= tracked
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) timer.command({ action: "finish", confirmedMs, notes })
      }}
    >
      <p className="text-xs text-text-muted">
        {formatTimer(tracked)} tracked, excluding pauses and breaks. If you
        slept, stopped working, or left the timer running, reduce the work time
        here.
      </p>
      <label className="grid gap-1.5 text-sm font-medium">
        Actual working minutes
        <Input
          className="h-11"
          type="number"
          step="0.001"
          min="0.017"
          max={tracked / 60000}
          required
          value={confirmed}
          onChange={(e) => setConfirmed(Number(e.target.value))}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Session note (optional)
        <Textarea
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {session.goal.goalType !== "minutes" && (
        <p className="text-xs text-text-muted">
          This saves time only. Log your quantity or completion separately.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="h-11"
          disabled={!valid || timer.conflict}
        >
          Save session
        </Button>
        <Button
          className="h-11"
          type="button"
          variant="outline"
          disabled={
            timer.conflict || timerPhaseRemaining(session, timer.now) <= 0
          }
          onClick={() => timer.command({ action: "resume" })}
        >
          Continue
        </Button>
        {session.mode === "countdown" && (
          <Button
            className="h-11"
            type="button"
            variant="outline"
            disabled={
              timer.conflict || session.targetMs + 300000 > MAX_TIMER_MS
            }
            onClick={() => timer.command({ action: "add_time", minutes: 5 })}
          >
            +5 min
          </Button>
        )}
        <Button
          type="button"
          className="h-11"
          variant="ghost"
          disabled={timer.conflict}
          onClick={() => timer.command({ action: "discard" })}
        >
          Discard session
        </Button>
      </div>
      {!valid && (
        <p className="text-xs text-text-muted">
          Record at least one second, up to the tracked working time, or
          discard.
        </p>
      )}
    </form>
  )
}
