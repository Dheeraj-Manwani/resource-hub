"use client"
import { useState, type ReactNode } from "react"
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
import { useHabitWrite } from "@/hooks/queries/habits"
import { showToast } from "@/lib/toast"
import { habitFromStarter, habitStarters } from "@/lib/habits/templates"
import {
  addDays,
  createHabitSchema,
  dateSchema,
  defaultConfig,
  nextEffectiveDate,
  upcomingDates,
  type Habit,
  type HabitConfig,
  type HabitInput,
} from "@/lib/habits/model"

export const controlClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
// Native labels wrap controls so each field remains accessible without a UI-specific form library.
function LabelField({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  )
}
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
export function HabitForm({
  habit,
  today,
  weekStart,
  onClose,
}: {
  habit?: Habit
  today: string
  weekStart: number
  onClose: () => void
}) {
  const [form, setForm] = useState<HabitInput>(() =>
    habit
      ? {
          name: habit.name,
          reason: habit.reason,
          icon: habit.icon,
          color: habit.color,
          config: habit.versions.at(-1)!.config,
        }
      : {
          name: "",
          reason: "",
          icon: "🌱",
          color: "orange",
          config: defaultConfig(today, weekStart),
        }
  )
  const [times, setTimes] = useState(form.config.times.join(", "))
  const [reminders, setReminders] = useState(form.config.reminders.join(", "))
  const [error, setError] = useState("")
  const [starter, setStarter] = useState("")
  const [clientId] = useState(() => crypto.randomUUID())
  const [expectedRevision] = useState(habit?.revision)
  const save = useHabitWrite("habit.save")
  const config = form.config
  const setConfig = (patch: Partial<HabitConfig>) =>
    setForm((current) => ({
      ...current,
      config: { ...current.config, ...patch },
    }))
  const effectiveFrom = habit
    ? habit.versions.at(-1)!.effectiveFrom > today
      ? habit.versions.at(-1)!.effectiveFrom
      : nextEffectiveDate(habit, today)
    : config.startDate
  const previewFrom = effectiveFrom > today ? effectiveFrom : today
  const preview =
    dateSchema.safeParse(config.startDate).success &&
    dateSchema.safeParse(previewFrom).success
      ? upcomingDates(config, previewFrom)
      : []
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const parseTimes = (value: string) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    const parsed = createHabitSchema.safeParse({
      ...form,
      id: clientId,
      config: {
        ...config,
        times: parseTimes(times),
        reminders: parseTimes(reminders),
        unit:
          config.goalType === "minutes"
            ? "minutes"
            : config.goalType === "done"
              ? "times"
              : config.unit,
      },
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your fields")
      return
    }
    setError("")
    try {
      const { id, ...input } = parsed.data
      const result = await save.mutateAsync({
        id: habit?.id ?? id,
        path: habit ? `/${habit.id}` : "",
        method: habit ? "PATCH" : "POST",
        body: habit ? { ...input, expectedRevision } : parsed.data,
      })
      showToast(
        habit ? "Habit updated" : "Your habit is ready",
        {
          description: habit
            ? result.effectiveFrom
              ? `Goal and schedule changes apply from ${result.effectiveFrom}. Earlier records stay intact.`
              : "Your earlier effort stays saved."
            : form.reason || "A little effort, recorded over time.",
        },
        "success"
      )
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save habit")
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
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        showCloseButton={!save.isPending}
      >
        <DialogHeader>
          <DialogTitle>{habit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            Give yourself a clear goal and a rhythm that fits your life.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          {!habit && (
            <fieldset className="grid gap-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">
                Start your way
              </legend>
              <label className="grid gap-1.5 text-sm">
                Starter template (optional)
                <select
                  className={controlClass}
                  value={starter}
                  onChange={(e) => setStarter(e.target.value)}
                >
                  <option value="">Choose a starter</option>
                  {habitStarters.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · {item.description}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-self-start"
                disabled={!starter || save.isPending}
                onClick={() => {
                  const input = habitFromStarter(starter, today, weekStart)
                  if (input) {
                    setForm(input)
                    setTimes("")
                    setReminders("")
                    setError("")
                  }
                }}
              >
                Use starter
              </Button>
              <p className="text-xs text-text-muted">
                This replaces the form fields. Adjust anything before saving;
                nothing is created yet.
              </p>
            </fieldset>
          )}
          <LabelField label="Habit name">
            <Input
              className="h-11"
              required
              maxLength={100}
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Read a little every day"
            />
          </LabelField>
          <LabelField label="Your reason (optional)">
            <Textarea
              maxLength={500}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="What makes this worth your time?"
            />
          </LabelField>
          <div className="grid grid-cols-2 gap-4">
            <LabelField label="Icon">
              <select
                className={controlClass}
                value={form.icon}
                onChange={(e) =>
                  setForm({
                    ...form,
                    icon: e.target.value as HabitInput["icon"],
                  })
                }
              >
                {["🌱", "📖", "🏃", "💧", "🧘", "🎨", "💪", "🎵"].map(
                  (icon) => (
                    <option key={icon}>{icon}</option>
                  )
                )}
              </select>
            </LabelField>
            <LabelField label="Colour">
              <select
                className={controlClass}
                value={form.color}
                onChange={(e) =>
                  setForm({
                    ...form,
                    color: e.target.value as HabitInput["color"],
                  })
                }
              >
                {["orange", "green", "blue", "violet", "rose"].map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </LabelField>
          </div>
          <fieldset className="grid gap-3 rounded-xl border p-4">
            <legend className="px-1 font-medium">Your goal</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <LabelField label="Track">
                <select
                  className={controlClass}
                  value={config.goalType}
                  onChange={(e) => {
                    const goalType = e.target.value as HabitConfig["goalType"]
                    setConfig({
                      goalType,
                      target: goalType === "done" ? 1 : 30,
                    })
                  }}
                >
                  <option value="minutes">Minutes</option>
                  <option value="quantity">Quantity</option>
                  <option value="done">Done / not done</option>
                </select>
              </LabelField>
              <LabelField label="Goal period">
                <select
                  className={controlClass}
                  value={config.goalPeriod}
                  disabled={config.schedule === "flexible"}
                  onChange={(e) =>
                    setConfig({
                      goalPeriod: e.target.value as HabitConfig["goalPeriod"],
                    })
                  }
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </LabelField>
              {config.goalType !== "done" && (
                <LabelField
                  label={
                    config.goalType === "minutes"
                      ? "Target minutes"
                      : "Target quantity"
                  }
                >
                  <Input
                    className="h-11"
                    type="number"
                    min="0.001"
                    step="0.001"
                    max="1000000"
                    required
                    value={config.target}
                    onChange={(e) =>
                      setConfig({ target: Number(e.target.value) })
                    }
                  />
                </LabelField>
              )}
              {config.goalType === "quantity" && (
                <LabelField label="Unit">
                  <Input
                    className="h-11"
                    maxLength={30}
                    required
                    value={config.unit}
                    onChange={(e) => setConfig({ unit: e.target.value })}
                    placeholder="pages, reps, glasses…"
                  />
                </LabelField>
              )}
            </div>
          </fieldset>
          <fieldset className="grid gap-3 rounded-xl border p-4">
            <legend className="px-1 font-medium">Your rhythm</legend>
            <LabelField label="Repeat">
              <select
                className={controlClass}
                value={config.schedule}
                onChange={(e) => {
                  const schedule = e.target.value as HabitConfig["schedule"]
                  setConfig({
                    schedule,
                    ...(schedule === "flexible"
                      ? { goalPeriod: "day" as const }
                      : {}),
                  })
                }}
              >
                <option value="daily">Every day</option>
                <option value="weekdays">Selected weekdays</option>
                <option value="interval">Every N days</option>
                <option value="monthly">Dates each month</option>
                <option value="flexible">N days a week, you choose when</option>
              </select>
            </LabelField>
            {(config.goalPeriod === "week" ||
              config.schedule === "flexible") && (
              <LabelField
                label="Goal week starts on"
                hint="Defaults to your account setting. Saved with the schedule to keep earlier results stable."
              >
                <select
                  className={controlClass}
                  value={config.weekStart}
                  onChange={(e) =>
                    setConfig({ weekStart: Number(e.target.value) })
                  }
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </LabelField>
            )}
            {config.schedule === "weekdays" && (
              <fieldset>
                <legend className="mb-2 text-sm">Weekdays</legend>
                <div className="flex flex-wrap gap-1">
                  {weekdays.map((day, index) => (
                    <Button
                      className="h-11 min-w-11"
                      key={day}
                      type="button"
                      aria-pressed={config.weekdays.includes(index)}
                      variant={
                        config.weekdays.includes(index) ? "default" : "outline"
                      }
                      onClick={() =>
                        setConfig({
                          weekdays: config.weekdays.includes(index)
                            ? config.weekdays.filter((d) => d !== index)
                            : [...config.weekdays, index].sort(),
                        })
                      }
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </fieldset>
            )}
            {config.schedule === "interval" && (
              <LabelField
                label="Every how many days?"
                hint="Counted from the start date."
              >
                <Input
                  className="h-11"
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={config.intervalDays}
                  onChange={(e) =>
                    setConfig({ intervalDays: Number(e.target.value) })
                  }
                />
              </LabelField>
            )}
            {config.schedule === "monthly" && (
              <>
                <fieldset>
                  <legend className="mb-2 text-sm">Monthly dates</legend>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <Button
                        className="h-11 min-w-0 px-0"
                        type="button"
                        key={day}
                        aria-pressed={config.monthDays.includes(day)}
                        variant={
                          config.monthDays.includes(day) ? "default" : "outline"
                        }
                        onClick={() =>
                          setConfig({
                            monthDays: config.monthDays.includes(day)
                              ? config.monthDays.filter((d) => d !== day)
                              : [...config.monthDays, day].sort(
                                  (a, b) => a - b
                                ),
                          })
                        }
                      >
                        {day}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <LabelField label="When a month has no chosen date">
                  <select
                    className={controlClass}
                    value={config.missingDate}
                    onChange={(e) =>
                      setConfig({
                        missingDate: e.target
                          .value as HabitConfig["missingDate"],
                      })
                    }
                  >
                    <option value="skip">Skip that date</option>
                    <option value="last_day">
                      Use the month&apos;s last day
                    </option>
                  </select>
                </LabelField>
              </>
            )}
            {config.schedule === "flexible" && (
              <LabelField
                label="Days per week"
                hint="Meet your daily goal on this many distinct days. Multiple logs on one day still count as one day."
              >
                <Input
                  className="h-11"
                  type="number"
                  min={1}
                  max={7}
                  required
                  value={config.weeklyDays}
                  onChange={(e) =>
                    setConfig({ weeklyDays: Number(e.target.value) })
                  }
                />
              </LabelField>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <LabelField label="Start date">
                <Input
                  className="h-11"
                  required
                  type="date"
                  value={config.startDate}
                  onChange={(e) => setConfig({ startDate: e.target.value })}
                />
              </LabelField>
              <LabelField label="End date (optional)">
                <Input
                  className="h-11"
                  type="date"
                  value={config.endDate ?? ""}
                  onChange={(e) =>
                    setConfig({ endDate: e.target.value || null })
                  }
                />
              </LabelField>
              <LabelField
                label="Preferred times (optional)"
                hint="24-hour times, separated by commas: 07:00, 19:30"
              >
                <Input
                  className="h-11"
                  value={times}
                  onChange={(e) => setTimes(e.target.value)}
                  placeholder="19:00"
                />
              </LabelField>
              <LabelField
                label="Reminder times (optional)"
                hint="24-hour times, separated by commas. Reminders appear while the app is open; they never record progress."
              >
                <Input
                  className="h-11"
                  value={reminders}
                  onChange={(e) => setReminders(e.target.value)}
                  placeholder="18:55"
                />
              </LabelField>
              <LabelField
                label="Default session minutes"
                hint="Pre-filled when you start a timer. You can choose a different duration for each session."
              >
                <Input
                  className="h-11"
                  type="number"
                  required
                  min={1}
                  max={1440}
                  value={config.defaultDuration}
                  onChange={(e) =>
                    setConfig({ defaultDuration: Number(e.target.value) })
                  }
                />
              </LabelField>
            </div>
          </fieldset>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">Upcoming dates</p>
            <p className="mt-1 text-text-muted">
              {config.schedule === "flexible"
                ? `${config.weeklyDays} days each week — choose the days as you go.`
                : preview.length
                  ? preview.join(" · ")
                  : "No upcoming dates within this schedule."}
            </p>
            {habit && (
              <p className="mt-2 text-xs">
                Goal and schedule changes begin{" "}
                {effectiveFrom > today ? effectiveFrom : addDays(today, 1)}.
                Earlier records keep their original goals.
              </p>
            )}
          </div>
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
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button className="h-11" type="submit" loading={save.isPending}>
              {habit ? "Save habit" : "Create habit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
