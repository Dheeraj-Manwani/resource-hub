import "server-only"

import { and, eq, isNull, desc, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  tasks,
  resources,
  projects,
  projectResources,
  quickNotes,
} from "@/lib/db/schema"
import {
  dateInTimezone,
  focusSignals,
  isPastDue,
  isToday,
  isThisWeek,
  overviewWindow,
  projectPaths,
  projectSummaries,
  type FocusSignal,
  type FocusTask,
  type OverviewSummary,
  type TaskSignal,
} from "@/lib/overview/model"
import { getProjectTree } from "./projects"
import { listResources, resourceOverviewCounts } from "./resources"
import { getSettings } from "./settings"
import { getTasksByIds } from "./tasks"

export type { OverviewSummary } from "@/lib/overview/model"

/** Lightweight rows shared by the overview's recurrence-aware sections. */
export async function getOverviewTaskSignals(
  userId: string
): Promise<TaskSignal[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      dueDate: tasks.dueDate,
      startAt: tasks.startAt,
      startDate: tasks.startDate,
      allDay: tasks.allDay,
      rrule: tasks.rrule,
      seriesId: tasks.seriesId,
      exdates: tasks.exdates,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt)
      )
    )
  return rows.map((task) => ({
    ...task,
    dueAt: task.dueAt?.toISOString() ?? null,
    startAt: task.startAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    updatedAt: task.updatedAt.toISOString(),
    exdates: (task.exdates ?? []).map((date) => date.toISOString()),
  }))
}

export async function getOverview(userId: string): Promise<OverviewSummary> {
  const [
    settings,
    taskSignals,
    tree,
    docs,
    resourceActivity,
    resourceCounts,
    reviewCounts,
    toReview,
  ] = await Promise.all([
    getSettings(userId),
    getOverviewTaskSignals(userId),
    getProjectTree(userId),
    db
      .select({
        id: quickNotes.id,
        title: quickNotes.title,
        kind: quickNotes.kind,
        projectId: quickNotes.projectId,
        updatedAt: quickNotes.updatedAt,
      })
      .from(quickNotes)
      .where(and(eq(quickNotes.userId, userId), isNull(quickNotes.deletedAt)))
      .orderBy(desc(quickNotes.updatedAt), desc(quickNotes.id)),
    db
      .select({
        projectId: projectResources.projectId,
        resourceId: resources.id,
        updatedAt: sql<Date>`greatest(${resources.updatedAt}, ${projectResources.addedAt})`,
      })
      .from(projectResources)
      .innerJoin(resources, eq(resources.id, projectResources.resourceId))
      .innerJoin(projects, eq(projects.id, projectResources.projectId))
      .where(
        and(
          eq(resources.userId, userId),
          eq(projects.userId, userId),
          isNull(resources.deletedAt),
          isNull(projects.deletedAt)
        )
      ),
    resourceOverviewCounts(userId),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(resources)
      .where(
        and(
          eq(resources.userId, userId),
          isNull(resources.deletedAt),
          eq(resources.isReviewed, false)
        )
      ),
    listResources(userId, {
      limit: 3,
      sort: "created",
      order: "desc",
      reviewed: false,
    }),
  ])
  const now = new Date()
  const window = overviewWindow(settings.timezone, now)
  const docSummaries = docs.map((d) => ({
    ...d,
    updatedAt: d.updatedAt.toISOString(),
  }))
  const signals = focusSignals(taskSignals, window)
  const actionable = signals.filter((s) => s.status !== "blocked")
  const todaySignals = actionable.filter((s) => isToday(s, window))
  const weekSignals = actionable.filter((s) => isThisWeek(s, window))
  const suggested = actionable.filter((s) => !s.dueAt && !s.dueDate).slice(0, 3)
  const blocked = taskSignals
    .filter((t) => t.status === "blocked")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const top = projectSummaries(
    tree,
    taskSignals,
    signals,
    docSummaries,
    resourceActivity.map((r) => ({
      ...r,
      updatedAt: new Date(r.updatedAt).toISOString(),
    })),
    window
  ).slice(0, 3)
  const visibleSignals = [
    ...todaySignals.slice(0, 6),
    ...weekSignals.slice(0, 6),
    ...suggested,
    ...top.flatMap((p) => (p.nextTask ? [p.nextTask] : [])),
  ]
  const hydrated = await getTasksByIds(userId, [
    ...new Set([
      ...visibleSignals.map((s) => s.taskId),
      ...blocked.slice(0, 2).map((t) => t.id),
    ]),
  ])
  const byId = new Map(hydrated.map((t) => [t.id, t]))
  const hydrate = (signal: FocusSignal): FocusTask => ({
    ...signal,
    task: byId.get(signal.taskId)!,
  })
  const visible = (items: FocusSignal[]) =>
    items
      .slice(0, 6)
      .filter((s) => byId.has(s.taskId))
      .map(hydrate)
  const projectContexts = await Promise.all(
    top.map((p) =>
      p.resourceCount
        ? listResources(
            userId,
            { limit: 2, sort: "updated", order: "desc" },
            { projectIds: p.memberProjectIds }
          )
        : Promise.resolve({ items: [] })
    )
  )
  return {
    generatedAt: now.toISOString(),
    timezone: settings.timezone,
    todayDate: window.todayDate,
    projectPaths: projectPaths(tree),
    tasks: {
      pastDue: actionable.filter((s) => isPastDue(s, window)).length,
      dueToday: actionable.filter(
        (s) => !isPastDue(s, window) && isToday(s, window)
      ).length,
      completedToday: taskSignals.filter(
        (t) =>
          t.status === "done" &&
          t.completedAt &&
          dateInTimezone(t.completedAt, settings.timezone) === window.todayDate
      ).length,
      activeTotal: taskSignals.filter((t) => t.status !== "done").length,
      todayCount: todaySignals.length,
      weekCount: weekSignals.length,
      today: visible(todaySignals),
      week: visible(weekSignals),
      suggested: visible(suggested),
      blockedCount: blocked.length,
      blocked: blocked
        .slice(0, 2)
        .flatMap((t) => (byId.get(t.id) ? [byId.get(t.id)!] : [])),
    },
    resources: {
      total: resourceCounts.total,
      toReviewCount: reviewCounts[0]?.count ?? 0,
      toReview: toReview.items,
    },
    projects: {
      total: tree.filter((p) => !p.archivedAt).length,
      top: top.map((p, i) => ({
        ...p,
        nextTask:
          p.nextTask && byId.has(p.nextTask.taskId)
            ? hydrate(p.nextTask)
            : null,
        resources: projectContexts[i].items,
      })),
    },
    docs: { recent: docSummaries.slice(0, 3) },
  }
}
