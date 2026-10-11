"use client"

import { FilterPanel } from "@/components/filter-panel"
import { useShell } from "@/components/shell/shell-context"
import { QueryFeedback } from "@/components/query-feedback"

import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin, {
  type DateClickArg,
  type DropArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction"
import listPlugin from "@fullcalendar/list"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
import luxonPlugin from "@fullcalendar/luxon3"
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  PlusIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { useProjectOptions } from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  useCalendarOccurrences,
  useEditOccurrence,
} from "@/hooks/queries/calendar"
import { useSettings, useUpdateSettings } from "@/hooks/queries/settings"
import { useTagSearch } from "@/hooks/queries/resources"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import type { CalendarOccurrence } from "@/lib/server/dal/calendar"
import { TASK_PRIORITY_HEX, TASK_STATUS_HEX } from "@/lib/tasks/colors"
import { todayIn } from "@/lib/habits/model"
import { civilTime, type HabitCalendarBlock } from "@/lib/habits/planning"
import { useHabitCalendar } from "@/hooks/queries/habits"
import { useHabitActions } from "@/components/habits/habit-actions-provider"
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/tasks/types"
import type { SettingsDto } from "@/lib/server/dal/settings"
import type { UpdateTaskInput } from "@/lib/validation/tasks"

import { CalendarSidePanel } from "./calendar-side-panel"
import { CalendarEventMenu } from "./calendar-event-menu"
import {
  OccurrenceScopeDialog,
  type OccurrenceScope,
} from "./occurrence-scope-dialog"
import {
  QuickCreateDialog,
  type QuickCreateTarget,
} from "./quick-create-dialog"

type ViewName = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek"
const VIEWS: { value: ViewName; label: string }[] = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "timeGridDay", label: "Day" },
  { value: "listWeek", label: "Agenda" },
]

type ColorMode = SettingsDto["calendarColorMode"]
const ALL = "__all"

function occurrenceInstant(occ: CalendarOccurrence): string {
  return occ.allDay ? `${occ.start}T00:00:00.000Z` : occ.start
}

function buildDatePatch(
  event: {
    allDay: boolean
    start: Date | null
    end: Date | null
  },
  timezone: string
): UpdateTaskInput {
  if (event.allDay) {
    return {
      dueDate: todayIn(timezone, event.start!),
      startDate: null,
      dueAt: null,
      startAt: null,
      allDay: true,
    }
  }
  return {
    dueAt: (event.end ?? event.start)!.toISOString(),
    startAt: event.start!.toISOString(),
    allDay: false,
    startDate: null,
    dueDate: null,
  }
}
type PendingMove = {
  occ: CalendarOccurrence
  occurrenceAt: string
  patch: UpdateTaskInput
  revert: () => void
}
function subscribeLayer(listener: () => void) {
  window.addEventListener("storage", listener)
  window.addEventListener("habit-calendar-layer", listener)
  return () => {
    window.removeEventListener("storage", listener)
    window.removeEventListener("habit-calendar-layer", listener)
  }
}

export function CalendarView({
  initialSettings,
}: {
  initialSettings: SettingsDto
}) {
  const calendarRef = useRef<FullCalendar>(null)
  const { openTask } = useDetailDrawer()
  const { data: settings } = useSettings(initialSettings)
  const updateSettings = useUpdateSettings()
  const habitActions = useHabitActions()
  const timezone = settings?.timezone ?? initialSettings.timezone
  const layerKey = `resource:habit-calendar-layer:${habitActions.userId}`
  const showHabits = useSyncExternalStore(
    subscribeLayer,
    () => {
      try {
        return localStorage.getItem(layerKey) !== "hidden"
      } catch {
        return true
      }
    },
    () => true
  )
  const colorMode =
    settings?.calendarColorMode ?? initialSettings.calendarColorMode
  const { openAddTask } = useShell()
  const { options: projectOptions } = useProjectOptions()
  const { data: tags = [] } = useTagSearch("")

  const [view, setView] = useState<ViewName>("dayGridMonth")
  const [title, setTitle] = useState("")
  const [range, setRange] = useState<{ from: Date; to: Date } | null>(null)
  const [projectId, setProjectId] = useState<string | undefined>()
  const [tag, setTag] = useState<string | undefined>()
  const [status, setStatus] = useState<string | undefined>()
  const [quickCreate, setQuickCreate] = useState<QuickCreateTarget>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)

  const editOccurrence = useEditOccurrence()
  const calendarQuery = useCalendarOccurrences(
    range ?? { from: new Date(), to: new Date() },
    { projectId, tag, status: status as never },
    !!range
  )
  const occurrences = useMemo(
    () => calendarQuery.data ?? [],
    [calendarQuery.data]
  )
  const habitsQuery = useHabitCalendar(
    range ? todayIn(timezone, range.from) : "1970-01-01",
    range ? todayIn(timezone, new Date(range.to.getTime() - 1)) : "1970-01-01",
    !!range && showHabits
  )

  useEffect(() => {
    // Mobile: default to agenda instead of month, which is cramped on a
    // phone. `changeView` triggers `datesSet`, which syncs `view` state.
    if (window.matchMedia("(max-width: 640px)").matches) {
      calendarRef.current?.getApi().changeView("listWeek")
    }
  }, [])
  const projectColors = useMemo(
    () => new Map(projectOptions.map((p) => [p.id, p.color])),
    [projectOptions]
  )
  const colorFor = useCallback(
    (occ: CalendarOccurrence) => {
      if (colorMode === "priority") return TASK_PRIORITY_HEX[occ.priority]
      if (colorMode === "status") return TASK_STATUS_HEX[occ.status]
      return (occ.projectId && projectColors.get(occ.projectId)) || "#737373"
    },
    [colorMode, projectColors]
  )

  const events: EventInput[] = useMemo(
    () => [
      ...occurrences.map((occ) => ({
        id: occ.id,
        title: occ.title,
        start: occ.start,
        end: occ.end ?? undefined,
        allDay: occ.allDay,
        backgroundColor: colorFor(occ),
        classNames: occ.status === "done" ? ["fc-event-done"] : [],
        extendedProps: occ,
      })),
      ...(showHabits ? (habitsQuery.data?.blocks ?? []) : []).map((block) => ({
        id: block.id,
        title: block.title,
        start: block.start,
        end: block.end ?? undefined,
        allDay: block.allDay,
        backgroundColor: `${block.color}22`,
        borderColor: block.color,
        textColor: block.color,
        editable: block.editable,
        durationEditable: block.editable && !block.allDay,
        classNames: [
          "fc-habit-event",
          ...(block.complete ? ["fc-habit-complete"] : []),
        ],
        extendedProps: block,
      })),
    ],
    [occurrences, colorFor, showHabits, habitsQuery.data]
  )
  function applyMove(
    occ: CalendarOccurrence,
    occurrenceAt: string,
    patch: UpdateTaskInput,
    revert: () => void
  ) {
    if (occ.isRecurring) {
      setPendingMove({ occ, occurrenceAt, patch, revert })
    } else {
      editOccurrence.mutate(
        { taskId: occ.taskId, input: { scope: "all", patch } },
        { onError: revert }
      )
    }
  }

  function onToggleComplete(occ: CalendarOccurrence) {
    const patch: UpdateTaskInput = {
      status: occ.status === "done" ? "todo" : "done",
    }
    if (occ.isRecurring) {
      editOccurrence.mutate({
        taskId: occ.taskId,
        input: { occurrenceAt: occurrenceInstant(occ), scope: "this", patch },
      })
    } else {
      editOccurrence.mutate({
        taskId: occ.taskId,
        input: { scope: "all", patch },
      })
    }
  }

  function onEventClick(info: EventClickArg) {
    const occ = info.event.extendedProps as
      CalendarOccurrence | HabitCalendarBlock
    if ("kind" in occ && occ.kind === "habit") {
      habitActions.openHabit(occ.habitId, occ.date, occ)
      return
    }
    if (!("taskId" in occ)) return
    openTask(occ.taskId)
  }

  function onEventDrop(info: EventDropArg) {
    const occ = info.event.extendedProps as
      CalendarOccurrence | HabitCalendarBlock
    if ("kind" in occ && occ.kind === "habit") {
      const date = info.event.startStr.slice(0, 10),
        time = info.event.allDay ? null : civilTime(info.event.start!, timezone)
      info.revert()
      habitActions.openPlan({
        habitId: occ.habitId,
        block: occ,
        date,
        time,
        minutes: occ.minutes,
      })
      return
    }
    if (!("taskId" in occ)) return
    const occurrenceAt = occ.allDay
      ? occurrenceInstant(occ)
      : (info.oldEvent.start ?? info.event.start)!.toISOString()
    applyMove(occ, occurrenceAt, buildDatePatch(info.event, timezone), () =>
      info.revert()
    )
  }

  function onEventResize(info: EventResizeDoneArg) {
    const occ = info.event.extendedProps as
      CalendarOccurrence | HabitCalendarBlock
    if ("kind" in occ && occ.kind === "habit") {
      const minutes = Math.max(
        1,
        Math.round(
          (info.event.end!.getTime() - info.event.start!.getTime()) / 60000
        )
      )
      info.revert()
      habitActions.openPlan({
        habitId: occ.habitId,
        block: occ,
        date: occ.date,
        time: occ.time,
        minutes,
      })
      return
    }
    if (!("taskId" in occ)) return
    const occurrenceAt = occ.allDay
      ? occurrenceInstant(occ)
      : (info.oldEvent.start ?? info.event.start)!.toISOString()
    applyMove(occ, occurrenceAt, buildDatePatch(info.event, timezone), () =>
      info.revert()
    )
  }

  function onDateClick(arg: DateClickArg) {
    setQuickCreate({ date: arg.date, allDay: arg.allDay })
  }

  function onSelect(arg: DateSelectArg) {
    setQuickCreate({ date: arg.start, allDay: arg.allDay })
    arg.view.calendar.unselect()
  }

  /** An "Unscheduled"/"Overdue" side-panel task dropped onto the calendar —
   * we don't want FullCalendar to add its own event for the drop, just use
   * the drop date to update the real task's due date. */
  function onDrop(arg: DropArg) {
    const taskId = arg.draggedEl.dataset.taskId
    if (!taskId) return
    const patch = buildDatePatch(
      {
        allDay: arg.allDay,
        start: arg.date,
        end: null,
      },
      timezone
    )
    editOccurrence.mutate({ taskId, input: { scope: "all", patch } })
  }

  function onDatesSet(arg: DatesSetArg) {
    setRange({ from: arg.start, to: arg.end })
    setTitle(arg.view.title)
    setView(arg.view.type as ViewName)
  }

  function changeView(next: ViewName) {
    calendarRef.current?.getApi().changeView(next)
    setView(next)
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => calendarRef.current?.getApi().today()}
          >
            Today
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Previous"
            onClick={() => calendarRef.current?.getApi().prev()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next"
            onClick={() => calendarRef.current?.getApi().next()}
          >
            <ChevronRightIcon />
          </Button>
          <h2 className="px-1 text-base font-medium">{title}</h2>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              className="min-h-11"
              size="sm"
              variant={showHabits ? "secondary" : "outline"}
              aria-pressed={showHabits}
              onClick={() => {
                try {
                  localStorage.setItem(
                    layerKey,
                    showHabits ? "hidden" : "shown"
                  )
                  window.dispatchEvent(new Event("habit-calendar-layer"))
                } catch {}
              }}
            >
              Habits {showHabits ? "on" : "off"}
            </Button>
            <Button
              className="min-h-11"
              size="sm"
              variant="outline"
              onClick={() => habitActions.openPlan()}
            >
              Plan a habit
            </Button>
            <Button
              size="sm"
              onClick={() =>
                openAddTask(undefined, {
                  defaultProject: projectOptions.find(
                    (p) => p.id === projectId
                  ),
                })
              }
            >
              <PlusIcon />
              Add task
            </Button>
            <ToggleGroup
              value={[view]}
              onValueChange={(values: string[]) => {
                const next = values[0] as ViewName | undefined
                if (next) changeView(next)
              }}
              variant="outline"
              size="sm"
              aria-label="Calendar view"
            >
              {VIEWS.map((v) => (
                <ToggleGroupItem
                  key={v.value}
                  value={v.value}
                  aria-label={v.label}
                  title={v.label}
                >
                  {v.value === "listWeek" ? <ListIcon /> : <CalendarDaysIcon />}
                  <span className="hidden sm:inline">{v.label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        <FilterPanel
          activeCount={[projectId, tag, status].filter(Boolean).length}
        >
          {" "}
          <Select
            value={projectId ?? ALL}
            onValueChange={(v: string | null) =>
              setProjectId(!v || v === ALL ? undefined : v)
            }
          >
            <SelectTrigger size="sm" aria-label="Filter by project">
              <SelectValue>
                {(v: string) =>
                  v === ALL
                    ? "All projects"
                    : (projectOptions.find((p) => p.id === v)?.name ??
                      "Project")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={ALL}>All projects</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tag ?? ALL}
            onValueChange={(v: string | null) =>
              setTag(!v || v === ALL ? undefined : v)
            }
          >
            <SelectTrigger size="sm" aria-label="Filter by tag">
              <SelectValue>
                {(v: string) =>
                  v === ALL
                    ? "All tags"
                    : `#${tags.find((t) => t.id === v)?.name ?? "tag"}`
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  #{t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status ?? ALL}
            onValueChange={(v: string | null) =>
              setStatus(!v || v === ALL ? undefined : v)
            }
          >
            <SelectTrigger size="sm" aria-label="Filter by status">
              <SelectValue>
                {(v: string) =>
                  v === ALL
                    ? "All statuses"
                    : TASK_STATUS_LABELS[v as keyof typeof TASK_STATUS_LABELS]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={ALL}>All statuses</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={colorMode}
            onValueChange={(v: string | null) =>
              v && updateSettings.mutate({ calendarColorMode: v as ColorMode })
            }
          >
            <SelectTrigger size="sm" aria-label="Color by">
              <SelectValue>{(v: string) => `Color: ${v}`}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="project">Color: project</SelectItem>
              <SelectItem value="priority">Color: priority</SelectItem>
              <SelectItem value="status">Color: status</SelectItem>
            </SelectContent>
          </Select>
        </FilterPanel>
        {range ? (
          <QueryFeedback
            query={calendarQuery}
            label="calendar"
            loading={false}
          />
        ) : null}
        {showHabits && range && (
          <QueryFeedback
            query={habitsQuery}
            label="habit plans"
            loading={false}
          />
        )}
        {showHabits && (
          <p className="mb-3 text-xs text-text-muted">
            Habit blocks show plans; ✓ means a saved goal was met. Task filters
            apply to tasks. Times: {timezone}.
          </p>
        )}
        {showHabits && !!habitsQuery.data?.flexible.length && (
          <section
            aria-label="Flexible habit targets"
            className="mb-4 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2"
          >
            {habitsQuery.data.flexible.map((target) => (
              <div
                key={`${target.habitId}:${target.versionId}:${target.start}`}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {target.icon} {target.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {target.start} – {target.end} · {target.days} /{" "}
                    {target.target} completed days
                  </p>
                </div>
                <Button
                  className="h-11"
                  size="sm"
                  variant="outline"
                  disabled={!target.planDate}
                  onClick={() =>
                    habitActions.openPlan({
                      habitId: target.habitId,
                      date: target.planDate ?? undefined,
                    })
                  }
                >
                  {target.planDate ? "Choose a day" : "Past week"}
                </Button>
              </div>
            ))}
          </section>
        )}

        <div
          role="region"
          aria-label="Calendar dates"
          tabIndex={0}
          className="overflow-x-auto"
        >
          <div
            className={
              view === "dayGridMonth" || view === "timeGridWeek"
                ? "min-w-[640px]"
                : "min-w-0"
            }
          >
            <FullCalendar
              ref={calendarRef}
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                listPlugin,
                interactionPlugin,
                luxonPlugin,
              ]}
              timeZone={timezone}
              firstDay={settings?.weekStart ?? initialSettings.weekStart}
              initialView="dayGridMonth"
              headerToolbar={false}
              height="auto"
              editable={!editOccurrence.isPending}
              selectable={!editOccurrence.isPending}
              droppable={!editOccurrence.isPending}
              noEventsContent={
                calendarQuery.isPending
                  ? ""
                  : calendarQuery.isError && !calendarQuery.data
                    ? "Events unavailable. Retry above."
                    : "No events in this range."
              }
              dayMaxEvents
              events={events}
              eventContent={(arg: EventContentArg) => {
                const occ = arg.event.extendedProps as
                  CalendarOccurrence | HabitCalendarBlock
                if ("kind" in occ && occ.kind === "habit")
                  return (
                    <button
                      type="button"
                      aria-label={`Habit ${occ.title}, ${occ.date}${occ.time ? ` ${occ.time}` : ""}, ${occ.complete ? "goal met" : occ.partial ? "partial work" : occ.skipped ? "skipped" : "planned"}`}
                      title={`${occ.title} · ${occ.date} · ${occ.time ?? "All day"} · ${occ.minutes} min planned · ${occ.recordedMinutes} min recorded`}
                      className="flex min-h-11 w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden px-1 text-left text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        habitActions.openHabit(occ.habitId, occ.date, occ)
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <span aria-hidden>
                          {occ.complete
                            ? "✓"
                            : occ.partial
                              ? "◐"
                              : occ.skipped
                                ? "↷"
                                : occ.icon}
                        </span>
                        <span className="truncate">{occ.title}</span>
                        {occ.time && (
                          <span className="ml-auto shrink-0 text-[10px]">
                            {occ.time}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[10px] opacity-80">
                        {occ.minutes}m planned
                        {occ.recordedMinutes > 0
                          ? ` · ${occ.recordedMinutes}m recorded`
                          : occ.complete
                            ? " · Goal met"
                            : ""}
                      </span>
                    </button>
                  )
                if (!("taskId" in occ)) return null
                return (
                  <CalendarEventMenu
                    occurrence={occ}
                    onOpen={() => openTask(occ.taskId)}
                    onToggle={() => onToggleComplete(occ)}
                    disabled={editOccurrence.isPending}
                  />
                )
              }}
              eventClick={onEventClick}
              eventDrop={onEventDrop}
              eventResize={onEventResize}
              dateClick={onDateClick}
              select={onSelect}
              drop={onDrop}
              datesSet={onDatesSet}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-muted lg:hidden">
          Swipe the calendar sideways, or choose Day or Agenda for a smaller
          view.
        </p>
      </div>

      <CalendarSidePanel className="lg:order-first" />
      <QuickCreateDialog
        timezone={timezone}
        projectId={projectId}
        target={quickCreate}
        onClose={() => setQuickCreate(null)}
      />

      <OccurrenceScopeDialog
        open={!!pendingMove}
        onOpenChange={(open) => {
          if (!open) {
            pendingMove?.revert()
            setPendingMove(null)
          }
        }}
        onChoose={async (scope: OccurrenceScope) => {
          if (!pendingMove) return
          await editOccurrence.mutateAsync(
            {
              taskId: pendingMove.occ.taskId,
              input: {
                occurrenceAt: pendingMove.occurrenceAt,
                scope,
                patch: pendingMove.patch,
              },
            },
            { onError: pendingMove.revert }
          )
          setPendingMove(null)
        }}
      />
    </div>
  )
}
