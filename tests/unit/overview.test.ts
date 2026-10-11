import { describe, expect, it } from "vitest"
import {
  dateInTimezone,
  focusSignals,
  isPastDue,
  isThisWeek,
  isToday,
  overviewWindow,
  projectPaths,
  projectSummaries,
  type TaskSignal,
} from "@/lib/overview/model"
import type { ProjectDto } from "@/lib/projects/types"

const now = new Date("2026-10-11T20:00:00.000Z")
const window = overviewWindow("Asia/Kolkata", now)
const task = (id: string, patch: Partial<TaskSignal> = {}): TaskSignal => ({
  id,
  title: id,
  projectId: null,
  status: "todo",
  priority: "medium",
  dueAt: null,
  dueDate: null,
  startAt: null,
  startDate: null,
  allDay: true,
  rrule: null,
  seriesId: null,
  updatedAt: now.toISOString(),
  completedAt: null,
  exdates: [],
  ...patch,
})
const project = (id: string, patch: Partial<ProjectDto> = {}): ProjectDto => ({
  id,
  name: id,
  parentId: null,
  description: null,
  icon: null,
  color: null,
  sortKey: "a0",
  archivedAt: null,
  directCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...patch,
})

describe("Overview focus", () => {
  it("uses account-local dates and keeps all-day tasks current until midnight", () => {
    expect(window.todayDate).toBe("2026-10-12")
    expect(window.start.toISOString()).toBe("2026-10-11T18:30:00.000Z")
    expect(dateInTimezone(now, "America/Los_Angeles")).toBe("2026-10-11")
    expect(isToday(task("today", { dueDate: "2026-10-12" }), window)).toBe(true)
    expect(isPastDue(task("today", { dueDate: "2026-10-12" }), window)).toBe(
      false
    )
    expect(
      isPastDue(task("yesterday", { dueDate: "2026-10-11" }), window)
    ).toBe(true)
    expect(
      isPastDue(task("timed", { dueAt: "2026-10-11T19:59:00.000Z" }), window)
    ).toBe(true)
    expect(
      isThisWeek(task("last day", { dueDate: "2026-10-18" }), window)
    ).toBe(true)
    expect(
      isThisWeek(task("next week", { dueDate: "2026-10-19" }), window)
    ).toBe(false)
  })

  it("ends a seven-day window at local midnight across a DST change", () => {
    const dst = overviewWindow(
      "America/New_York",
      new Date("2026-10-29T12:00:00.000Z")
    )
    expect(dst.start.toISOString()).toBe("2026-10-29T04:00:00.000Z")
    expect(dst.end.toISOString()).toBe("2026-11-05T05:00:00.000Z")
    expect(dst.endDate).toBe("2026-11-05")
  })

  it("orders overdue, today, upcoming and unscheduled tasks with priority tie-breaks", () => {
    const signals = focusSignals(
      [
        task("unscheduled", { priority: "urgent" }),
        task("future", { dueDate: "2026-10-13", priority: "urgent" }),
        task("today low", { dueDate: "2026-10-12", priority: "low" }),
        task("today high", { dueDate: "2026-10-12", priority: "high" }),
        task("overdue", { dueDate: "2026-10-10", priority: "low" }),
        task("done", { status: "done", dueDate: "2026-10-10" }),
      ],
      window
    )
    expect(signals.map((s) => s.taskId)).toEqual([
      "overdue",
      "today high",
      "today low",
      "future",
      "unscheduled",
    ])
  })

  it("expands current recurring occurrences without turning the old anchor into backlog", () => {
    const signals = focusSignals(
      [
        task("series", {
          dueDate: "2026-09-01",
          rrule: "FREQ=DAILY",
          exdates: ["2026-10-13T00:00:00.000Z"],
        }),
      ],
      window
    )
    expect(signals).toHaveLength(6)
    expect(signals[0].dueDate).toBe("2026-10-12")
    expect(signals[0].occurrenceAt).toBe("2026-10-12T00:00:00.000Z")
    expect(signals.some((s) => isPastDue(s, window))).toBe(false)
    expect(signals.map((s) => s.dueDate)).not.toContain("2026-10-13")
  })

  it("uses the due time for recurring tasks spanning local midnight", () => {
    const signals = focusSignals(
      [
        task("overnight", {
          allDay: false,
          startAt: "2026-10-10T18:00:00.000Z",
          dueAt: "2026-10-10T20:00:00.000Z",
          rrule: "FREQ=DAILY",
        }),
      ],
      window
    )
    expect(signals[0].occurrenceAt).toBe("2026-10-11T18:00:00.000Z")
    expect(signals[0].dueAt).toBe("2026-10-11T20:00:00.000Z")
    expect(isToday(signals[0], window)).toBe(true)
  })
})

describe("Overview projects", () => {
  it("rolls up descendants, deduplicates resources and ranks contained activity", () => {
    const projects = [
      project("parent"),
      project("child", { parentId: "parent" }),
      project("recent"),
      project("archived", {
        parentId: "parent",
        archivedAt: now.toISOString(),
      }),
    ]
    const tasks = [
      task("child task", { projectId: "child", dueDate: "2026-10-12" }),
      task("completed", { projectId: "parent", status: "done" }),
      task("archived task", { projectId: "archived" }),
    ]
    const summaries = projectSummaries(
      projects,
      tasks,
      focusSignals(tasks, window),
      [
        {
          id: "doc",
          title: "Doc",
          kind: "text",
          projectId: "child",
          updatedAt: now.toISOString(),
        },
      ],
      [
        {
          projectId: "parent",
          resourceId: "same",
          updatedAt: now.toISOString(),
        },
        {
          projectId: "child",
          resourceId: "same",
          updatedAt: now.toISOString(),
        },
        {
          projectId: "recent",
          resourceId: "other",
          updatedAt: "2026-10-11T21:00:00.000Z",
        },
      ],
      window
    )
    expect(summaries[0]).toMatchObject({
      id: "parent",
      subprojectCount: 1,
      taskDone: 1,
      taskTotal: 2,
      resourceCount: 1,
      docCount: 1,
      nextTask: { taskId: "child task" },
      lastActivityAt: now.toISOString(),
    })
    expect(projectPaths(projects).child).toBe("parent / child")
    const activityOnly = projectSummaries(
      projects,
      [],
      [],
      [],
      [
        {
          projectId: "recent",
          resourceId: "other",
          updatedAt: now.toISOString(),
        },
      ],
      window
    )
    expect(activityOnly[0].id).toBe("recent")
  })
})
