"use client"
import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useHabitWrite } from "@/hooks/queries/habits"
import { showToast } from "@/lib/toast"
import { habitFromStarter } from "@/lib/habits/templates"
import { habitColors } from "@/lib/habits/planning"
import { habitIcons } from "@/lib/habits/appearance"
import { HabitHelp } from "./habit-help"
import {
  addDays,
  createHabitSchema,
  dateSchema,
  defaultConfig,
  nextEffectiveDate,
  isTimeGoal,
  goalMinutes,
  timerGoalAmount,
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
  const hintId = useId()
  return (
    <div className="grid min-w-0 gap-1.5 text-sm">
      <label className="grid min-w-0 gap-1.5">
        <span className="font-medium">{label}</span>
        {hint && isValidElement<{ "aria-describedby"?: string }>(children)
          ? cloneElement(children, { "aria-describedby": hintId })
          : children}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
function readableDate(date: string, today: string) {
  if (date === today) return "Today"
  if (date === addDays(today, 1)) return "Tomorrow"
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.slice(0, 4) !== today.slice(0, 4)
      ? { year: "numeric" as const }
      : {}),
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`))
}
function HabitSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  "aria-describedby": descriptionId,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; decoration?: ReactNode }[]
  disabled?: boolean
  "aria-describedby"?: string
}) {
  const selected = options.find((option) => option.value === value)
  return (
    <Select
      value={value}
      disabled={disabled}
      items={options.map(({ value, label }) => ({ value, label }))}
      onValueChange={(value: string | null) => {
        if (value !== null) onChange(value)
      }}
    >
      <SelectTrigger
        aria-label={label}
        aria-describedby={descriptionId}
        className="w-full min-w-0 rounded-lg bg-background px-3 shadow-xs hover:border-border-strong data-[size=default]:h-11"
      >
        <SelectValue>
          {selected?.decoration}
          {selected?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="p-1">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            label={option.label}
            className="min-h-10 py-2 pl-3"
          >
            {option.decoration}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
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
        unit: isTimeGoal(config)
          ? config.goalType
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
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={!save.isPending}
      >
        <DialogHeader className="shrink-0 gap-1 border-b border-border px-5 py-4 pr-10 sm:px-6">
          <div className="flex items-center gap-1.5">
            <DialogTitle className="text-lg font-semibold">
              {habit ? "Edit habit" : "New habit"}
            </DialogTitle>
            <HabitHelp
              disabled={save.isPending}
              onChooseTemplate={
                habit
                  ? undefined
                  : (id) => {
                      const input = habitFromStarter(id, today, weekStart)
                      if (input) {
                        setForm(input)
                        setTimes(input.config.times.join(", "))
                        setReminders(input.config.reminders.join(", "))
                        setError("")
                      }
                    }
              }
            />
          </div>
          <DialogDescription>
            Give yourself a clear goal and a rhythm that fits your life.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
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
                className="min-h-20 resize-y"
                maxLength={500}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="What makes this worth your time?"
              />
            </LabelField>
            <div className="grid grid-cols-2 gap-4">
              <LabelField label="Icon">
                <HabitSelect
                  label="Icon"
                  value={form.icon}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      icon: value as HabitInput["icon"],
                    })
                  }
                  options={Object.entries(habitIcons).map(([value, label]) => ({
                    value,
                    label,
                    decoration: (
                      <span aria-hidden="true" className="text-lg">
                        {value}
                      </span>
                    ),
                  }))}
                />
              </LabelField>
              <LabelField label="Colour">
                <HabitSelect
                  label="Colour"
                  value={form.color}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      color: value as HabitInput["color"],
                    })
                  }
                  options={Object.entries(habitColors).map(
                    ([value, color]) => ({
                      value,
                      label: value[0].toUpperCase() + value.slice(1),
                      decoration: (
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ),
                    })
                  )}
                />
              </LabelField>
            </div>
            <fieldset className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4">
              <legend className="px-1 font-medium">Your goal</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <LabelField label="Track">
                  <HabitSelect
                    label="Track"
                    value={config.goalType}
                    onChange={(value) => {
                      const goalType = value as HabitConfig["goalType"]
                      setConfig({
                        goalType,
                        target:
                          isTimeGoal(config) && isTimeGoal({ goalType })
                            ? Math.max(
                                0.001,
                                timerGoalAmount(
                                  { goalType },
                                  goalMinutes(config, config.target) * 60000
                                )
                              )
                            : goalType === "done" || goalType === "hours"
                              ? 1
                              : 30,
                      })
                    }}
                    options={[
                      { value: "minutes", label: "Minutes" },
                      { value: "hours", label: "Hours" },
                      { value: "quantity", label: "Quantity" },
                      { value: "done", label: "Done / not done" },
                    ]}
                  />
                </LabelField>
                <LabelField label="Goal period">
                  <HabitSelect
                    label="Goal period"
                    value={config.goalPeriod}
                    disabled={config.schedule === "flexible"}
                    onChange={(value) =>
                      setConfig({
                        goalPeriod: value as HabitConfig["goalPeriod"],
                      })
                    }
                    options={[
                      { value: "day", label: "Daily" },
                      { value: "week", label: "Weekly" },
                      { value: "month", label: "Monthly" },
                    ]}
                  />
                </LabelField>
                {config.goalType !== "done" && (
                  <LabelField
                    label={
                      isTimeGoal(config)
                        ? `Target ${config.goalType}`
                        : "Target quantity"
                    }
                    hint={
                      config.goalType === "hours"
                        ? "Use decimals for part of an hour: 1.5 hours is 1 hour 30 minutes."
                        : undefined
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
            <fieldset className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4">
              <legend className="px-1 font-medium">Your rhythm</legend>
              <LabelField label="Repeat">
                <HabitSelect
                  label="Repeat"
                  value={config.schedule}
                  onChange={(value) => {
                    const schedule = value as HabitConfig["schedule"]
                    setConfig({
                      schedule,
                      ...(schedule === "flexible"
                        ? { goalPeriod: "day" as const }
                        : {}),
                    })
                  }}
                  options={[
                    { value: "daily", label: "Every day" },
                    { value: "weekdays", label: "Selected weekdays" },
                    { value: "interval", label: "Every N days" },
                    { value: "monthly", label: "Dates each month" },
                    {
                      value: "flexible",
                      label: "N days a week, you choose when",
                    },
                  ]}
                />
              </LabelField>
              {(config.goalPeriod === "week" ||
                config.schedule === "flexible") && (
                <LabelField
                  label="Goal week starts on"
                  hint="Defaults to your account setting. Saved with the schedule to keep earlier results stable."
                >
                  <HabitSelect
                    label="Goal week starts on"
                    value={String(config.weekStart)}
                    onChange={(value) =>
                      setConfig({ weekStart: Number(value) })
                    }
                    options={weekdays.map((label, index) => ({
                      value: String(index),
                      label,
                    }))}
                  />
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
                          config.weekdays.includes(index)
                            ? "default"
                            : "outline"
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
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(
                        (day) => (
                          <Button
                            className="h-11 min-w-0 px-0"
                            type="button"
                            key={day}
                            aria-pressed={config.monthDays.includes(day)}
                            variant={
                              config.monthDays.includes(day)
                                ? "default"
                                : "outline"
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
                        )
                      )}
                    </div>
                  </fieldset>
                  <LabelField label="When a month has no chosen date">
                    <HabitSelect
                      label="When a month has no chosen date"
                      value={config.missingDate}
                      onChange={(value) =>
                        setConfig({
                          missingDate: value as HabitConfig["missingDate"],
                        })
                      }
                      options={[
                        { value: "skip", label: "Skip that date" },
                        {
                          value: "last_day",
                          label: "Use the month’s last day",
                        },
                      ]}
                    />
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
              </div>
            </fieldset>
            <fieldset className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4">
              <legend className="px-1 font-medium">Times &amp; sessions</legend>
              <div className="grid gap-4 sm:grid-cols-2">
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
                    ? preview
                        .map((date) => readableDate(date, today))
                        .join(" · ")
                    : "No upcoming dates within this schedule."}
              </p>
              {habit && (
                <p className="mt-2 text-xs">
                  Goal and schedule changes start:{" "}
                  {readableDate(
                    effectiveFrom > today ? effectiveFrom : addDays(today, 1),
                    today
                  )}
                  . Earlier records keep their original goals.
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-5 py-4 sm:px-6">
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
