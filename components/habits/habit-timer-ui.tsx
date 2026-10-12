"use client"
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import {
  CheckIcon,
  CoffeeIcon,
  DownloadIcon,
  MessageSquareIcon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  SkipForwardIcon,
  SquareIcon,
  Trash2Icon,
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
import { useHabitTimer } from "./habit-timer-provider"
import {
  formatTimer,
  isActiveTimer,
  MAX_TIMER_MS,
  timerElapsed,
  timerPhaseRemaining,
  type TimerMode,
} from "@/lib/habits/timer"
import { isTimeGoal, todayIn, versionOn } from "@/lib/habits/model"
import { useSettings } from "@/hooks/queries/settings"
import { controlClass } from "./habit-form"
import { HabitNudge } from "./habit-motivation"
import { useHabitPreferences } from "@/hooks/queries/habits"
import { cn } from "@/lib/utils"

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
      const next = await api.requestWindow({ width: 280, height: 180 })
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
      next.document.body.className = "m-0 bg-background text-foreground p-2"
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
              <div className="flex items-center gap-2">
                <PictureInPicture2Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-text-muted"
                />
                <p
                  className="max-w-44 min-w-0 truncate text-xs"
                  title={timer.session.name}
                >
                  {timer.session.name}
                </p>
                <TimerAction
                  compact
                  label="Bring timer back"
                  icon={<PictureInPicture2Icon />}
                  variant="ghost"
                  onClick={() => popup.close()}
                />
              </div>
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
            {!isTimeGoal(current.config) &&
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
function TimerAction({
  compact = false,
  label,
  icon,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  compact?: boolean
  label: string
  icon: ReactNode
}) {
  return (
    <Button
      type="button"
      {...props}
      size={compact ? "icon-sm" : "default"}
      className={cn(compact ? "size-7 [&_svg]:size-3.5" : "h-11", className)}
      aria-label={label}
      title={compact ? label : undefined}
    >
      {icon}
      {!compact && label}
    </Button>
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
    <div
      className={cn("grid min-w-0", pip ? "gap-2" : "gap-3")}
      aria-label={pip ? "Habit timer" : undefined}
    >
      {!pip &&
        preferences?.nudges &&
        !preferences.quiet &&
        elapsed >= 300000 && (
          <p
            className="text-xs text-text-muted"
            aria-label="Session encouragement"
          >
            {Math.floor(elapsed / 60000)} minutes of working time. Finish when
            you are ready; review and save to keep it.
          </p>
        )}
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "min-w-0 truncate font-medium",
            pip ? "text-xs" : "text-sm"
          )}
          title={session.name}
        >
          {session.icon} {session.name}
        </p>
        <Button
          size="icon"
          className={cn(
            "shrink-0",
            pip ? "size-7 [&_svg]:size-3.5" : "size-11"
          )}
          variant="ghost"
          aria-label={pip ? "Bring timer back" : "Pop out timer"}
          title={pip ? "Bring timer back" : "Picture-in-picture"}
          disabled={!supported}
          onClick={onPopOut}
        >
          <PictureInPicture2Icon />
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
          className={cn(
            "font-heading font-medium tabular-nums",
            pip ? "text-2xl leading-none" : "text-4xl"
          )}
        >
          {formatTimer(session.mode !== "stopwatch" ? remaining : elapsed)}
        </span>
        {(!pip || session.status !== "running" || expired) && (
          <span
            className={cn("text-text-muted", pip ? "text-[11px]" : "text-xs")}
          >
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
        )}
      </div>
      {cycle && (
        <div
          className={cn(
            "space-y-1 text-text-muted",
            pip ? "text-[11px]" : "text-xs"
          )}
        >
          <p role="status">
            {cycle.phase === "break" ? "Break" : "Work"} ·{" "}
            {pip
              ? `${cycle.round}/${cycle.rounds}`
              : `Round ${cycle.round} of ${cycle.rounds}`}
            {expired && !pip ? " · Phase finished" : ""}
          </p>
          {!pip && (
            <p>
              {formatTimer(elapsed)} working time so far. Breaks are excluded.
            </p>
          )}
        </div>
      )}
      {!pip && timer.recovered && isActiveTimer(session.status) && (
        <p className="text-xs text-text-muted">
          Recovered or synced timer. Review elapsed work before saving.
        </p>
      )}
      {session.status === "review" && !timer.conflict ? (
        <ReviewSession
          key={session.id}
          compact={pip}
          hidden={pip && discard}
          onDiscard={pip ? () => setDiscard(true) : undefined}
        />
      ) : (
        isActiveTimer(session.status) &&
        (!pip || !discard) && (
          <div className={cn("flex flex-wrap", pip ? "gap-1.5" : "gap-2")}>
            <TimerAction
              compact={pip}
              label={session.status === "running" ? "Pause" : "Resume"}
              icon={session.status === "running" ? <PauseIcon /> : <PlayIcon />}
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
            />
            {cycle &&
              (cycle.phase === "break" ||
                (expired && cycle.round < cycle.rounds)) && (
                <TimerAction
                  compact={pip}
                  label={
                    cycle.phase === "work"
                      ? "Start break"
                      : expired
                        ? "Start next round"
                        : "Skip break · start next round"
                  }
                  icon={
                    cycle.phase === "work" ? (
                      <CoffeeIcon />
                    ) : (
                      <SkipForwardIcon />
                    )
                  }
                  variant="outline"
                  disabled={disabled}
                  onClick={() => timer.command({ action: "next_phase" })}
                />
              )}
            {session.mode === "countdown" && (
              <TimerAction
                compact={pip}
                label="+5 min"
                icon={<PlusIcon />}
                variant="outline"
                disabled={disabled || session.targetMs + 300000 > MAX_TIMER_MS}
                onClick={() =>
                  timer.command({ action: "add_time", minutes: 5 })
                }
              />
            )}
            <TimerAction
              compact={pip}
              label="Finish"
              icon={<SquareIcon />}
              disabled={disabled}
              onClick={() => timer.command({ action: "review" })}
            />
            <TimerAction
              compact={pip}
              label="Discard"
              icon={<Trash2Icon />}
              variant="ghost"
              disabled={disabled}
              onClick={() => setDiscard(true)}
            />
          </div>
        )
      )}
      {discard && (
        <div
          className={cn(
            "rounded-lg border",
            pip ? "p-2 text-[11px]" : "p-3 text-sm"
          )}
        >
          <p>
            {pip
              ? "Discard without saving?"
              : "Discard this session? No time will be recorded."}
          </p>
          <div className="mt-2 flex gap-2">
            <TimerAction
              compact={pip}
              label="Keep session"
              icon={<CheckIcon />}
              variant="outline"
              onClick={() => setDiscard(false)}
            />
            <TimerAction
              compact={pip}
              label="Discard session"
              icon={<Trash2Icon />}
              variant="destructive"
              onClick={() => {
                timer.command({ action: "discard" })
                setDiscard(false)
              }}
            />
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
            <TimerAction
              compact={pip}
              label="Save unsent copy"
              icon={<DownloadIcon />}
              variant="outline"
              onClick={timer.downloadDraft}
            />
            <TimerAction
              compact={pip}
              label="Use latest timer"
              icon={<RefreshCwIcon />}
              variant="outline"
              loading={timer.busy}
              disabled={!timer.online}
              onClick={timer.reviewLatest}
            />
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
function ReviewSession({
  compact = false,
  hidden = false,
  onDiscard,
}: {
  compact?: boolean
  hidden?: boolean
  onDiscard?: () => void
}) {
  const timer = useHabitTimer(),
    session = timer.session!
  const tracked = timerElapsed(session, timer.now)
  const [confirmed, setConfirmed] = useState(Math.floor(tracked / 60) / 1000)
  const [notes, setNotes] = useState("")
  const [showNotes, setShowNotes] = useState(false)
  const confirmedMs = Math.round(confirmed * 60000)
  const valid = confirmedMs >= 1000 && confirmedMs <= tracked
  return (
    <form
      hidden={hidden}
      className={cn("grid", compact ? "gap-2" : "gap-3")}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) timer.command({ action: "finish", confirmedMs, notes })
      }}
    >
      <p className={cn("text-text-muted", compact ? "text-[11px]" : "text-xs")}>
        {formatTimer(tracked)} tracked
        {compact
          ? ". Adjust before saving."
          : ", excluding pauses and breaks. If you slept, stopped working, or left the timer running, reduce the work time here."}
      </p>
      <label
        className={
          compact
            ? "flex items-center justify-between gap-2 text-xs font-medium"
            : "grid gap-1.5 text-sm font-medium"
        }
      >
        {compact ? "Minutes worked" : "Actual working minutes"}
        <Input
          className={compact ? "h-7 w-24 text-xs" : "h-11"}
          aria-label="Actual working minutes"
          type="number"
          step="0.001"
          min="0.017"
          max={tracked / 60000}
          required
          value={confirmed}
          onChange={(e) => setConfirmed(Number(e.target.value))}
        />
      </label>
      {(!compact || showNotes) && (
        <label
          className={
            compact
              ? "grid gap-1 text-xs font-medium"
              : "grid gap-1.5 text-sm font-medium"
          }
        >
          Session note (optional)
          <Textarea
            className={compact ? "min-h-12 text-xs" : undefined}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      )}
      {!isTimeGoal(session.goal) && (
        <p className="text-xs text-text-muted">
          This saves time only. Log your quantity or completion separately.
        </p>
      )}
      <div className={cn("flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
        <TimerAction
          compact={compact}
          label="Save session"
          icon={<SaveIcon />}
          type="submit"
          disabled={!valid || timer.conflict}
        />
        <TimerAction
          compact={compact}
          label="Continue"
          icon={<PlayIcon />}
          variant="outline"
          disabled={
            timer.conflict || timerPhaseRemaining(session, timer.now) <= 0
          }
          onClick={() => timer.command({ action: "resume" })}
        />
        {session.mode === "countdown" && (
          <TimerAction
            compact={compact}
            label="+5 min"
            icon={<PlusIcon />}
            variant="outline"
            disabled={
              timer.conflict || session.targetMs + 300000 > MAX_TIMER_MS
            }
            onClick={() => timer.command({ action: "add_time", minutes: 5 })}
          />
        )}
        {compact && (
          <TimerAction
            compact
            label="Session note (optional)"
            icon={<MessageSquareIcon />}
            variant="ghost"
            aria-expanded={showNotes}
            onClick={() => setShowNotes(!showNotes)}
          />
        )}
        <TimerAction
          compact={compact}
          label="Discard session"
          icon={<Trash2Icon />}
          variant="ghost"
          disabled={timer.conflict}
          onClick={() =>
            onDiscard ? onDiscard() : timer.command({ action: "discard" })
          }
        />
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
