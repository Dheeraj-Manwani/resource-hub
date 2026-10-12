import { describe, expect, it } from "vitest"
import {
  focusSignals,
  overviewWindow,
  type TaskSignal,
} from "@/lib/overview/model"
import {
  attentionProjectSignals,
  overviewSectionQuerySchema,
} from "@/lib/overview/section-data"
import type { ProjectDto } from "@/lib/projects/types"

const window = overviewWindow("Asia/Kolkata", new Date("2026-10-11T20:00:00Z"))
const project = (id: string, patch: Partial<ProjectDto> = {}): ProjectDto => ({
  id,
  name: id,
  description: null,
  icon: null,
  color: null,
  parentId: null,
  sortKey: "a0",
  directCount: 0,
  archivedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...patch,
})
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
  exdates: [],
  completedAt: null,
  updatedAt: "2026-10-01T00:00:00Z",
  ...patch,
})

describe("additional overview sections", () => {
  it("rolls attention up once to active roots and chooses a task that needs resolution", () => {
    const projects = [
      project("root"),
      project("child", { parentId: "root" }),
      project("blocked"),
      project("healthy"),
      project("archived", { archivedAt: "2026-10-01T00:00:00Z" }),
      project("archived-child", {
        parentId: "root",
        archivedAt: "2026-10-01T00:00:00Z",
      }),
    ]
    const tasks = [
      task("late", { projectId: "child", dueDate: "2026-10-11" }),
      task("blocked-task", { projectId: "blocked", status: "blocked" }),
      task("done", {
        projectId: "root",
        dueDate: "2026-10-10",
        status: "done",
      }),
      task("today", { projectId: "healthy", dueDate: "2026-10-12" }),
      task("archived-task", { projectId: "archived", status: "blocked" }),
      task("archived-child-task", {
        projectId: "archived-child",
        status: "blocked",
      }),
      task("unassigned", { status: "blocked" }),
    ]
    const rows = attentionProjectSignals(
      projects,
      tasks,
      focusSignals(tasks, window),
      window
    )
    expect(rows.map((row) => row.project.id)).toEqual(["root", "blocked"])
    expect(rows[0]).toMatchObject({
      attentionTaskId: "late",
      project: { overdueCount: 1, blockedCount: 0, subprojectCount: 1 },
    })
    expect(rows[1]).toMatchObject({
      attentionTaskId: "blocked-task",
      project: { overdueCount: 0, blockedCount: 1 },
    })
  })

  it("does not flag a recurring master just because its original date is old", () => {
    const projects = [project("reading")]
    const tasks = [
      task("daily", {
        projectId: "reading",
        dueDate: "2026-10-01",
        rrule: "FREQ=DAILY",
      }),
    ]
    expect(
      attentionProjectSignals(
        projects,
        tasks,
        focusSignals(tasks, window),
        window
      )
    ).toEqual([])
  })

  it("accepts only known section types and scoped doc filters", () => {
    expect(
      overviewSectionQuerySchema.safeParse({
        section: "docs-by-project",
        projectId: "unassigned",
      }).success
    ).toBe(true)
    for (const invalid of [
      {},
      { section: "daily-brief" },
      { section: "docs-by-project", projectId: "bad-id" },
      { section: "favorite-resources", projectId: "unassigned" },
      { section: "recently-completed-tasks", userId: "someone-else" },
    ])
      expect(overviewSectionQuerySchema.safeParse(invalid).success).toBe(false)
  })
})
