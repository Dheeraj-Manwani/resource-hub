import { QueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, it } from "vitest"
import { OptimisticJournal } from "@/lib/optimistic/journal"
import {
  beginResources,
  beginTasks,
  settleResources,
  settleTasks,
  resourceProjects,
  taskResources,
  reorderChecklist,
  changeTags,
} from "@/lib/optimistic/actions"
import { taskCache, resourceCache } from "@/lib/optimistic/domains"
import { projectCache } from "@/lib/optimistic/projects"
import { refreshReferences } from "@/lib/optimistic/references"
import { occurrenceCache, patchOccurrence } from "@/lib/optimistic/calendar"
import { dueCache, reminderKey } from "@/hooks/queries/reminders"
import { tagCache } from "@/hooks/queries/tags"
import { quickNoteCache } from "@/hooks/queries/quick-notes"
import { describeMutation, syncMutation } from "@/lib/sync/mutations"
import type { TaskDto } from "@/lib/tasks/types"
import type { ResourceDto } from "@/lib/resources/dto"
import type { ProjectDto } from "@/lib/projects/types"
import type { CalendarOccurrence } from "@/lib/server/dal/calendar"

const clients: QueryClient[] = []
const client = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(qc)
  return qc
}
afterEach(() => clients.splice(0).forEach((qc) => qc.clear()))
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id,
  title: id,
  projectId: null,
  project: null,
  descriptionJson: null,
  descriptionText: null,
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  startDate: null,
  dueDate: null,
  allDay: false,
  rrule: null,
  seriesId: null,
  originalOccurrenceAt: null,
  completedAt: null,
  archivedAt: null,
  sortKey: "a0",
  checklist: [],
  tags: [],
  resources: [],
  reminders: [],
  createdAt: "",
  updatedAt: "",
  ...extra,
})
const resource = (
  id: string,
  extra: Partial<ResourceDto> = {}
): ResourceDto => ({
  id,
  type: "note",
  url: null,
  title: id,
  description: null,
  notes: null,
  bodyJson: null,
  bodyText: null,
  metadata: {},
  metadataOverride: null,
  metadataStatus: "ok",
  metadataFetchedAt: null,
  embedStatus: "ok",
  isFavorite: false,
  isReviewed: false,
  thumbnailUrl: null,
  file: null,
  tags: [],
  projects: [],
  taskCount: 0,
  createdAt: "",
  updatedAt: "",
  ...extra,
})
const project = (id: string): ProjectDto => ({
  id,
  parentId: null,
  name: id,
  description: null,
  icon: null,
  color: null,
  sortKey: "a0",
  archivedAt: null,
  directCount: 0,
  createdAt: "",
  updatedAt: "",
})
const list = <T>(items: T[]) => ({
  pages: [{ items, nextCursor: null }],
  pageParams: [null],
})
const occurrence = (
  id: string,
  extra: Partial<CalendarOccurrence> = {}
): CalendarOccurrence => ({
  id,
  taskId: "t",
  title: "Event",
  status: "todo",
  priority: "medium",
  projectId: null,
  start: "2026-10-05",
  end: null,
  allDay: true,
  isRecurring: false,
  seriesId: null,
  ...extra,
})

describe("optimistic expansion under overlapping writes", () => {
  it("commits a count-only acknowledgment without committing the next failed patch", () => {
    const journal = new OptimisticJournal<{ title: string; done: boolean }>()
    let current: unknown
    const a = journal.begin(
      "a",
      { title: "Original", done: false },
      (row) => row && { ...row, done: true },
      (row) => (current = row)
    )
    const b = journal.begin(
      "a",
      null,
      (row) => row && { ...row, title: "Rejected" },
      () => {}
    )
    journal.commit("a", a)
    journal.settle("a", b)
    expect(current).toEqual({ title: "Original", done: true })
  })
  it("rolls back a bulk deletion without undoing another success or a new row", () => {
    const qc = client()
    const key = ["resources", "list", {}]
    qc.setQueryData(key, list([resource("a"), resource("b"), resource("c")]))
    const tokens = beginResources(qc, ["a", "b"], () => null)
    resourceCache.accept(qc, resource("c", { isFavorite: true }))
    resourceCache.accept(qc, resource("d"))
    settleResources(qc, tokens, "rollback")
    const rows =
      qc.getQueryData<ReturnType<typeof list<ResourceDto>>>(key)!.pages[0].items
    expect(rows.map((row) => row.id).sort()).toEqual(["a", "b", "c", "d"])
    expect(rows.find((row) => row.id === "c")?.isFavorite).toBe(true)
  })
  it("keeps an acknowledged project association when a later favorite fails", () => {
    const qc = client()
    qc.setQueryData(["projects", "tree"], { items: [project("p")] })
    resourceCache.accept(qc, resource("r"))
    const link = beginResources(qc, ["r"], (row) =>
      resourceProjects(qc, row, null, "p")
    )
    const favorite = resourceCache.begin(
      qc,
      "r",
      (row) => row && { ...row, isFavorite: true }
    )
    settleResources(qc, link, "commit")
    resourceCache.settle(qc, "r", favorite)
    expect(resourceCache.read(qc, "r")).toMatchObject({
      isFavorite: false,
      projects: [{ id: "p" }],
    })
  })
  it("does not invent an actionable chip for uncached projects or new tag IDs", () => {
    const qc = client(),
      row = resource("r")
    expect(resourceProjects(qc, row, null, "unknown").projects).toEqual([])
    expect(changeTags(qc, [], ["new tag"], true)).toEqual([])
    qc.setQueryData(["tags", "with-counts"], {
      items: [{ id: "real", name: "Known", color: null }],
    })
    expect(changeTags(qc, [], ["#KNOWN", "known"], true)).toEqual([
      { id: "real", name: "Known", color: null },
    ])
  })
  it("adds/removes association chips without duplicates or guessing task counts", () => {
    const qc = client()
    resourceCache.accept(qc, resource("r"))
    const row = task("t")
    const linked = taskResources(qc, row, ["r", "r", "unknown"], true)
    expect(linked.resources.map((row) => row.id)).toEqual(["r"])
    expect(taskResources(qc, linked, ["r"], false).resources).toEqual([])
    expect(resourceCache.read(qc, "r")?.taskCount).toBe(0)
  })
  it("acknowledges bulk status separately from a later rejected title", () => {
    const qc = client()
    taskCache.accept(qc, task("t"))
    const bulk = beginTasks(qc, ["t", "t"], (row) => ({
      ...row,
      status: "done",
    }))
    expect(bulk).toHaveLength(1)
    const later = taskCache.begin(
      qc,
      "t",
      (row) => row && { ...row, title: "Rejected" }
    )
    settleTasks(qc, bulk, true)
    taskCache.settle(qc, "t", later)
    expect(taskCache.read(qc, "t")).toMatchObject({
      title: "t",
      status: "done",
    })
  })
  it("updates project chips and restores them without erasing a pending task edit", () => {
    const qc = client(),
      p = project("p")
    qc.setQueryData(["projects", "tree"], { items: [p] })
    taskCache.accept(qc, task("t", { projectId: "p", project: p }))
    resourceCache.accept(qc, resource("r", { projects: [p] }))
    const edit = taskCache.begin(
      qc,
      "t",
      (row) => row && { ...row, title: "Pending title" }
    )
    const name = projectCache.patch(
      qc,
      "p",
      (row) => row && { ...row, name: "Renamed", color: "red" }
    )
    expect(taskCache.read(qc, "t")?.project?.name).toBe("Renamed")
    expect(resourceCache.read(qc, "r")?.projects[0].color).toBe("red")
    projectCache.settle(qc, "p", name)
    expect(taskCache.read(qc, "t")).toMatchObject({
      title: "Pending title",
      project: { name: "p" },
    })
    taskCache.settle(qc, "t", edit)
  })
  it("keeps committed tag metadata after an older entity journal subsequently rolls back", () => {
    const qc = client(),
      tag = {
        id: "g",
        name: "Original",
        color: null,
        resourceCount: 1,
        taskCount: 1,
      }
    qc.setQueryData(["tags", "with-counts"], { items: [tag] })
    taskCache.accept(qc, task("t", { tags: [tag] }))
    const taskEdit = taskCache.begin(
      qc,
      "t",
      (row) => row && { ...row, title: "Rejected" }
    )
    const rename = tagCache.begin(
      qc,
      "g",
      (row) => row && { ...row, name: "Renamed" }
    )
    refreshReferences(qc)
    expect(taskCache.read(qc, "t")?.tags[0].name).toBe("Renamed")
    tagCache.settle(qc, "g", rename, { ...tag, name: "Normalized" })
    refreshReferences(qc)
    taskCache.settle(qc, "t", taskEdit)
    expect(taskCache.read(qc, "t")).toMatchObject({
      title: "t",
      tags: [{ name: "Normalized" }],
    })
  })
  it("rolls back a failed tag color without erasing another tag's rename", () => {
    const qc = client(),
      tags = ["a", "b"].map((id) => ({
        id,
        name: id,
        color: null,
        resourceCount: 0,
        taskCount: 0,
      }))
    qc.setQueryData(["tags", "with-counts"], { items: tags })
    resourceCache.accept(qc, resource("r", { tags }))
    const color = tagCache.begin(
      qc,
      "a",
      (row) => row && { ...row, color: "red" }
    )
    const rename = tagCache.begin(
      qc,
      "b",
      (row) => row && { ...row, name: "B" }
    )
    tagCache.commit(qc, "b", rename)
    tagCache.settle(qc, "a", color)
    refreshReferences(qc)
    expect(resourceCache.read(qc, "r")?.tags).toMatchObject([
      { name: "a", color: null },
      { name: "B" },
    ])
  })
  it("dismisses one reminder occurrence and restores it without removing new reminders", () => {
    const qc = client(),
      first = {
        reminderId: "r",
        taskId: "t",
        title: "Task",
        occurrenceAt: "2026-10-05",
        fireAt: "",
        offsetMinutes: 0,
      },
      next = { ...first, occurrenceAt: "2026-10-06" }
    qc.setQueryData(["reminders", "due"], { items: [first, next] })
    const token = dueCache.begin(qc, reminderKey(first), () => null)
    expect(dueCache.project(qc, [first, next], ["reminders", "due"])).toEqual([
      next,
    ])
    qc.setQueryData(["reminders", "due"], {
      items: [next, { ...first, reminderId: "new" }],
    })
    dueCache.settle(qc, reminderKey(first), token)
    expect(
      qc.getQueryData<{ items: (typeof first)[] }>(["reminders", "due"])?.items
    ).toHaveLength(3)
  })
  it("retains an acknowledged checklist order after a subsequent removal fails", () => {
    const qc = client(),
      items = ["a", "b", "c"].map((id, index) => ({
        id,
        title: id,
        done: false,
        sortKey: `a${index}`,
      }))
    taskCache.accept(qc, task("t", { checklist: items }))
    const order = taskCache.begin(
      qc,
      "t",
      (row) =>
        row && { ...row, checklist: reorderChecklist(row.checklist, "c", "a") }
    )
    const remove = taskCache.begin(
      qc,
      "t",
      (row) =>
        row && {
          ...row,
          checklist: row.checklist.filter((item) => item.id !== "c"),
        }
    )
    taskCache.commit(qc, "t", order)
    taskCache.settle(qc, "t", remove)
    expect(taskCache.read(qc, "t")?.checklist.map((row) => row.id)).toEqual([
      "c",
      "a",
      "b",
    ])
  })
  it("restores an explicit-save card while preserving another pending project change", () => {
    const qc = client(),
      note = {
        id: "n",
        title: "Original",
        bodyJson: null,
        bodyText: "Original body",
        projectId: null,
        project: null,
        createdAt: "",
        updatedAt: "",
      }
    qc.setQueryData(["quick-notes"], { items: [note] })
    const body = quickNoteCache.begin(
      qc,
      "n",
      (row) => row && { ...row, title: "Rejected", bodyText: "Rejected body" }
    )
    const link = quickNoteCache.begin(
      qc,
      "n",
      (row) => row && { ...row, projectId: "p" }
    )
    quickNoteCache.settle(qc, "n", body)
    expect(quickNoteCache.read(qc, "n")).toMatchObject({
      title: "Original",
      bodyText: "Original body",
      projectId: "p",
    })
    quickNoteCache.commit(qc, "n", link)
  })
  it("restores a moved calendar event but preserves a newer completion patch", () => {
    const qc = client(),
      key = [
        "calendar",
        "2026-10-01T00:00:00.000Z",
        "2026-10-31T00:00:00.000Z",
        {},
      ],
      row = occurrence("event")
    qc.setQueryData(key, { items: [row] })
    const move = occurrenceCache.begin(
      qc,
      row.id,
      (value) => value && patchOccurrence(value, { dueDate: "2026-10-09" })
    )
    const complete = occurrenceCache.begin(
      qc,
      row.id,
      (value) => value && patchOccurrence(value, { status: "done" })
    )
    occurrenceCache.settle(qc, row.id, move)
    expect(occurrenceCache.read(qc, row.id)).toMatchObject({
      start: "2026-10-05",
      status: "done",
    })
    occurrenceCache.commit(qc, row.id, complete)
  })
  it("removes an event from a mismatched date/status view and restores it on rejection", () => {
    const qc = client(),
      key = [
        "calendar",
        "2026-10-01T00:00:00.000Z",
        "2026-10-07T00:00:00.000Z",
        { status: "todo" },
      ],
      row = occurrence("event")
    qc.setQueryData(key, { items: [row] })
    const move = occurrenceCache.begin(
      qc,
      row.id,
      (value) => value && patchOccurrence(value, { dueDate: "2026-10-09" })
    )
    expect(
      qc.getQueryData<{ items: CalendarOccurrence[] }>(key)?.items
    ).toEqual([])
    occurrenceCache.settle(qc, row.id, move)
    expect(
      qc.getQueryData<{ items: CalendarOccurrence[] }>(key)?.items
    ).toEqual([row])
  })
  it("retains recurring events whose start is in range even when their duration ends outside it", () => {
    const qc = client(),
      key = [
        "calendar",
        "2026-10-01T00:00:00.000Z",
        "2026-10-07T00:00:00.000Z",
        {},
      ]
    const row = occurrence("recurring", {
      allDay: false,
      isRecurring: true,
      seriesId: "master",
      start: "2026-10-06T23:00:00.000Z",
      end: "2026-10-07T01:00:00.000Z",
    })
    expect(occurrenceCache.project(qc, [row], key)).toEqual([row])
  })
  it("never invents a recurring exception or automatically retries explicit note content", () => {
    const row = occurrence("recurring", {
      isRecurring: true,
      seriesId: "master",
    })
    expect(
      patchOccurrence(row, { status: "done", dueDate: "2026-10-09" })
    ).toBe(row)
    expect(
      describeMutation(syncMutation("quick-note.update").meta.sync, {
        id: "n",
        bodyJson: {},
        bodyText: "old",
      }).safeRetry
    ).toBe(false)
    expect(
      describeMutation(syncMutation("tag.rename").meta.sync, {
        id: "g",
        name: "collision",
      }).safeRetry
    ).toBe(false)
    expect(
      describeMutation(syncMutation("task.bulk").meta.sync, {
        taskIds: ["a", "b"],
      }).entityKeys
    ).toEqual(["task:a", "task:b"])
  })
})
