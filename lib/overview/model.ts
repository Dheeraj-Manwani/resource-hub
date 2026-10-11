import { TZDate } from "@date-fns/tz"
import type { ProjectDto } from "@/lib/projects/types"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"
import type { ResourceDto } from "@/lib/resources/dto"
import { expandOccurrences, parseDateOnly } from "@/lib/tasks/recurrence"
import type { TaskDto } from "@/lib/tasks/types"

export type DocSummary = Pick<
  QuickNoteDto,
  "id" | "title" | "kind" | "projectId" | "updatedAt"
>
export type TaskSignal = Pick<
  TaskDto,
  | "id"
  | "title"
  | "projectId"
  | "status"
  | "priority"
  | "dueAt"
  | "dueDate"
  | "startAt"
  | "startDate"
  | "allDay"
  | "rrule"
  | "seriesId"
  | "updatedAt"
  | "completedAt"
> & { exdates: string[] }
export type FocusSignal = {
  key: string
  taskId: string
  projectId: string | null
  title: string
  priority: TaskDto["priority"]
  status: TaskDto["status"]
  dueAt: string | null
  dueDate: string | null
  occurrenceAt: string | null
}
export type FocusTask = FocusSignal & { task: TaskDto }
export type OverviewProject = ProjectDto & {
  memberProjectIds: string[]
  subprojectCount: number
  taskDone: number
  taskTotal: number
  resourceCount: number
  docCount: number
  overdueCount: number
  blockedCount: number
  lastActivityAt: string
  nextTask: FocusTask | null
  docs: DocSummary[]
  resources: ResourceDto[]
}
export type OverviewSummary = {
  generatedAt: string
  timezone: string
  todayDate: string
  projectPaths: Record<string, string>
  tasks: {
    pastDue: number
    dueToday: number
    completedToday: number
    activeTotal: number
    todayCount: number
    weekCount: number
    today: FocusTask[]
    week: FocusTask[]
    suggested: FocusTask[]
    blockedCount: number
    blocked: TaskDto[]
  }
  projects: { total: number; top: OverviewProject[] }
  resources: { total: number; toReviewCount: number; toReview: ResourceDto[] }
  docs: { recent: DocSummary[] }
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
export function dateInTimezone(value: string | Date, timezone: string) {
  let formatter = dateFormatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    dateFormatters.set(timezone, formatter)
  }
  const parts = formatter.formatToParts(new Date(value))
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}
export function overviewWindow(timezone: string, now: Date) {
  const todayDate = dateInTimezone(now, timezone)
  const [year, month, day] = todayDate.split("-").map(Number)
  const start = new Date(new TZDate(year, month - 1, day, timezone).getTime())
  const end = new Date(new TZDate(year, month - 1, day + 7, timezone).getTime())
  return {
    todayDate,
    endDate: dateInTimezone(end, timezone),
    start,
    end,
    now: now.toISOString(),
    timezone,
  }
}
export type OverviewWindow = ReturnType<typeof overviewWindow>
export function dueDay(
  task: Pick<FocusSignal, "dueAt" | "dueDate">,
  window: OverviewWindow
) {
  return (
    task.dueDate ??
    (task.dueAt ? dateInTimezone(task.dueAt, window.timezone) : null)
  )
}
export function isPastDue(
  task: Pick<FocusSignal, "dueAt" | "dueDate">,
  window: OverviewWindow
) {
  return task.dueDate
    ? task.dueDate < window.todayDate
    : !!task.dueAt && task.dueAt < window.now
}
export function isToday(
  task: Pick<FocusSignal, "dueAt" | "dueDate">,
  window: OverviewWindow
) {
  return isPastDue(task, window) || dueDay(task, window) === window.todayDate
}
export function isThisWeek(
  task: Pick<FocusSignal, "dueAt" | "dueDate">,
  window: OverviewWindow
) {
  const day = dueDay(task, window)
  return !!day && (isPastDue(task, window) || day < window.endDate)
}
const priorities = { urgent: 4, high: 3, medium: 2, low: 1 }
export function rankFocus(
  a: FocusSignal,
  b: FocusSignal,
  window: OverviewWindow
) {
  const bucket = (task: FocusSignal) =>
    isPastDue(task, window)
      ? 0
      : dueDay(task, window) === window.todayDate
        ? 1
        : task.dueAt || task.dueDate
          ? 2
          : 3
  return (
    bucket(a) - bucket(b) ||
    priorities[b.priority] - priorities[a.priority] ||
    (a.dueAt ?? a.dueDate ?? "~").localeCompare(b.dueAt ?? b.dueDate ?? "~") ||
    a.key.localeCompare(b.key)
  )
}
/** Series contribute this week's occurrences, not their old anchor date. */
export function focusSignals(
  tasks: TaskSignal[],
  window: OverviewWindow
): FocusSignal[] {
  return tasks
    .filter((task) => task.status !== "done")
    .flatMap<FocusSignal>((task) => {
      const base = {
        taskId: task.id,
        projectId: task.projectId,
        title: task.title,
        priority: task.priority,
        status: task.status,
      }
      if (!task.rrule || task.seriesId)
        return [
          {
            ...base,
            key: task.id,
            dueAt: task.dueAt,
            dueDate: task.dueDate,
            occurrenceAt: null,
          },
        ]
      const anchor = task.startAt ?? task.dueAt
      const dateAnchor = task.startDate ?? task.dueDate
      if (!anchor && !dateAnchor) return []
      const dtstart = anchor ? new Date(anchor) : parseDateOnly(dateAnchor!)
      const from = task.allDay ? parseDateOnly(window.todayDate) : window.start
      const to = task.allDay
        ? new Date(parseDateOnly(window.endDate).getTime() - 1)
        : new Date(window.end.getTime() - 1)
      const duration =
        task.startAt && task.dueAt
          ? new Date(task.dueAt).getTime() - new Date(task.startAt).getTime()
          : 0
      return expandOccurrences(
        task.rrule!,
        dtstart,
        new Date(from.getTime() - Math.max(0, duration)),
        to,
        task.exdates.map((value) => new Date(value))
      )
        .map((instant) => {
          const dueAt = task.allDay
            ? null
            : new Date(instant.getTime() + duration).toISOString()
          const dueDate = task.allDay
            ? instant.toISOString().slice(0, 10)
            : null
          return {
            ...base,
            key: `${task.id}:${instant.toISOString()}`,
            dueAt,
            dueDate,
            occurrenceAt: instant.toISOString(),
          }
        })
        .filter((signal) => {
          const day = dueDay(signal, window)!
          return day >= window.todayDate && day < window.endDate
        })
    })
    .sort((a, b) => rankFocus(a, b, window))
}
export function projectPaths(projects: ProjectDto[]) {
  const byId = new Map(projects.map((p) => [p.id, p]))
  return Object.fromEntries(
    projects.map((project) => {
      const names: string[] = [],
        seen = new Set<string>()
      let current: ProjectDto | undefined = project
      while (current && !seen.has(current.id)) {
        seen.add(current.id)
        names.unshift(current.name)
        current = current.parentId ? byId.get(current.parentId) : undefined
      }
      return [project.id, names.join(" / ")]
    })
  )
}
export type ResourceActivity = {
  projectId: string
  resourceId: string
  updatedAt: string
}
export function projectSummaries(
  projects: ProjectDto[],
  tasks: TaskSignal[],
  signals: FocusSignal[],
  docs: DocSummary[],
  resources: ResourceActivity[],
  window: OverviewWindow
) {
  const active = projects.filter((p) => !p.archivedAt)
  const byId = new Map(active.map((p) => [p.id, p]))
  const roots = active.filter((p) => !p.parentId || !byId.has(p.parentId))
  const members = (id: string) => {
    const found = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const p of active)
        if (p.parentId && found.has(p.parentId) && !found.has(p.id)) {
          found.add(p.id)
          changed = true
        }
    }
    return found
  }
  return roots
    .map((project) => {
      const ids = members(project.id)
      const ownTasks = tasks.filter(
        (t) => !!t.projectId && ids.has(t.projectId)
      )
      const ownDocs = docs
        .filter((doc) => !!doc.projectId && ids.has(doc.projectId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const ownResources = resources.filter((r) => ids.has(r.projectId))
      const ownSignals = signals.filter(
        (s) => !!s.projectId && ids.has(s.projectId)
      )
      return {
        ...project,
        memberProjectIds: [...ids],
        subprojectCount: ids.size - 1,
        taskDone: ownTasks.filter((t) => t.status === "done").length,
        taskTotal: ownTasks.length,
        docCount: ownDocs.length,
        resourceCount: new Set(ownResources.map((r) => r.resourceId)).size,
        overdueCount: ownSignals.filter((s) => isPastDue(s, window)).length,
        blockedCount: ownTasks.filter((t) => t.status === "blocked").length,
        lastActivityAt: [
          project.updatedAt,
          ...ownTasks.map((t) => t.updatedAt),
          ...ownDocs.map((d) => d.updatedAt),
          ...ownResources.map((r) => r.updatedAt),
        ]
          .sort()
          .at(-1)!,
        nextTask: ownSignals.find((s) => s.status !== "blocked") ?? null,
        docs: ownDocs.slice(0, 2),
      }
    })
    .sort(
      (a, b) =>
        Number(b.overdueCount > 0) - Number(a.overdueCount > 0) ||
        Number(b.blockedCount > 0) - Number(a.blockedCount > 0) ||
        (a.nextTask && b.nextTask
          ? rankFocus(a.nextTask, b.nextTask, window)
          : Number(!!b.nextTask) - Number(!!a.nextTask)) ||
        b.lastActivityAt.localeCompare(a.lastActivityAt) ||
        a.id.localeCompare(b.id)
    )
}
