import { QueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { taskCache, resourceCache, taskMatches, resourceMatches } from "@/lib/optimistic/domains"
import { OptimisticJournal, journalFor, resetJournals } from "@/lib/optimistic/journal"
import { WriteCoordinator } from "@/lib/optimistic/coordinator"
import { NoteDrafts } from "@/lib/optimistic/drafts"
import { projectCache, projectedProject } from "@/lib/optimistic/projects"
import { capturePositions } from "@/lib/optimistic/lists"
import { applyPatch } from "@/hooks/queries/tasks"
import type { TaskDto } from "@/lib/tasks/types"
import type { ResourceDto } from "@/lib/resources/dto"
import type { ProjectDto } from "@/lib/projects/types"
import { SyncController } from "@/lib/sync/controller"
import { syncMutation } from "@/lib/sync/mutations"
import { ApiClientError } from "@/lib/api-client"

const task = (id: string, patch: Partial<TaskDto> = {}): TaskDto => ({ id, title: id, projectId: null, project: null, descriptionJson: null, descriptionText: null, status: "todo", priority: "medium", startAt: null, dueAt: null, startDate: null, dueDate: null, allDay: false, rrule: null, seriesId: null, originalOccurrenceAt: null, completedAt: null, archivedAt: null, sortKey: id === "a" ? "a0" : "a1", checklist: [{ id: "item", title: "Item", done: false, sortKey: "a0" }], tags: [], resources: [], reminders: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...patch })
const resource = (id: string, patch: Partial<ResourceDto> = {}): ResourceDto => ({ id, type: "note", url: null, title: id, description: null, notes: null, bodyJson: null, bodyText: null, metadata: {}, metadataOverride: null, metadataStatus: "ok", metadataFetchedAt: null, embedStatus: "ok", isFavorite: false, isReviewed: false, thumbnailUrl: null, file: null, tags: [], projects: [], taskCount: 0, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...patch })
const project = (id: string, parentId: string | null = null): ProjectDto => ({ id, parentId, name: id, description: null, icon: null, color: null, sortKey: "a0", archivedAt: null, directCount: 0, createdAt: "", updatedAt: "" })
const list = <T>(items: T[], nextCursor: string | null = null) => ({ pages: [{ items, nextCursor }], pageParams: [null] })
const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const clients: QueryClient[] = []
const client = () => { const value = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(value); return value }
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers() })

describe("entity rollback and rebasing", () => {
  it("rolls back one entity without undoing another entity's successful edit", () => {
    const qc = client(); qc.setQueryData(["tasks", "list", {}], list([task("a"), task("b")]))
    const a = taskCache.begin(qc, "a", (value) => value ? { ...value, title: "A edited" } : value)
    const b = taskCache.begin(qc, "b", (value) => value ? { ...value, priority: "urgent" } : value)
    taskCache.settle(qc, "b", b, task("b", { priority: "urgent" }))
    taskCache.settle(qc, "a", a)
    expect(taskCache.read(qc, "a")?.title).toBe("a")
    expect(taskCache.read(qc, "b")?.priority).toBe("urgent")
  })
  it("keeps newer same-entity edits when an older request fails or succeeds", () => {
    const qc = client(); qc.setQueryData(["tasks", "detail", "a"], task("a"))
    const a = taskCache.begin(qc, "a", (value) => value ? { ...value, title: "Old" } : value)
    const b = taskCache.begin(qc, "a", (value) => value ? { ...value, title: "Latest" } : value)
    taskCache.settle(qc, "a", a, task("a", { title: "Normalized old", priority: "high" }))
    expect(taskCache.read(qc, "a")).toMatchObject({ title: "Latest", priority: "high" })
    taskCache.settle(qc, "a", b)
    expect(taskCache.read(qc, "a")).toMatchObject({ title: "Normalized old", priority: "high" })
  })
  it("removes a failed layer before applying the next partial patch", () => {
    const qc = client(); qc.setQueryData(["tasks", "detail", "a"], task("a"))
    const a = taskCache.begin(qc, "a", (value) => value ? { ...value, title: "Bad" } : value)
    const b = taskCache.begin(qc, "a", (value) => value ? { ...value, priority: "urgent" } : value)
    taskCache.settle(qc, "a", a)
    expect(taskCache.read(qc, "a")).toMatchObject({ title: "a", priority: "urgent" })
    taskCache.settle(qc, "a", b, task("a", { priority: "urgent" }))
    expect(taskCache.pending(qc)).toBe(false)
  })
  it("rebases failures on a newer authoritative read instead of an obsolete snapshot", () => {
    const qc = client(); qc.setQueryData(["tasks", "detail", "a"], task("a"))
    const token = taskCache.begin(qc, "a", (value) => value ? { ...value, title: "Local" } : value)
    expect(taskCache.received(qc, task("a", { priority: "high" })).title).toBe("Local")
    taskCache.settle(qc, "a", token)
    expect(taskCache.read(qc, "a")).toMatchObject({ title: "a", priority: "high" })
  })
  it("restores a deleted row without overwriting newly added rows or updates", () => {
    const qc = client(); const key = ["resources", "list", {}]
    qc.setQueryData(key, list([resource("a"), resource("b")]))
    const token = resourceCache.begin(qc, "a", () => null)
    resourceCache.accept(qc, resource("c"))
    resourceCache.accept(qc, resource("b", { isFavorite: true }))
    resourceCache.settle(qc, "a", token)
    const values = qc.getQueryData<ReturnType<typeof list<ResourceDto>>>(key)!.pages[0].items
    expect(values.map((item) => item.id).sort()).toEqual(["a", "b", "c"])
    expect(values.find((item) => item.id === "b")!.isFavorite).toBe(true)
    expect(capturePositions<ResourceDto>(qc, ["resources", "list"], "a").values().next().value).toEqual({ page: 0, index: 2 })
  })
  it("restores checklist state in both detail and every list", () => {
    const qc = client(); qc.setQueryData(["tasks", "list", {}], list([task("a")]))
    const token = taskCache.begin(qc, "a", (value) => value ? { ...value, checklist: value.checklist.map((item) => ({ ...item, done: true })) } : value)
    expect(taskCache.read(qc, "a")?.checklist[0].done).toBe(true)
    taskCache.settle(qc, "a", token)
    expect(taskCache.read(qc, "a")?.checklist[0].done).toBe(false)
    expect(qc.getQueryData<ReturnType<typeof list<TaskDto>>>(["tasks", "list", {}])!.pages[0].items[0].checklist[0].done).toBe(false)
  })
  it("ignores obsolete settlements after a reset", () => {
    const journal = new OptimisticJournal<TaskDto>(); const write = vi.fn()
    const token = journal.begin("a", task("a"), (value) => value, write)
    journal.reset(); journal.settle("a", token, task("a", { title: "Old session" }))
    expect(write).toHaveBeenCalledTimes(1)
  })
})

describe("filtered lists and sort reconciliation", () => {
  it("moves a favorite between complete known lists and rolls back membership", () => {
    const qc = client(); const normal = ["resources", "list", { favorite: false }], favorites = ["resources", "list", { favorite: true }]
    qc.setQueryData(normal, list([resource("a")])); qc.setQueryData(favorites, list<ResourceDto>([]))
    const token = resourceCache.begin(qc, "a", (value) => value ? { ...value, isFavorite: true } : value)
    expect(qc.getQueryData<ReturnType<typeof list<ResourceDto>>>(normal)!.pages[0].items).toHaveLength(0)
    expect(qc.getQueryData<ReturnType<typeof list<ResourceDto>>>(favorites)!.pages[0].items).toHaveLength(1)
    resourceCache.settle(qc, "a", token)
    expect(qc.getQueryData<ReturnType<typeof list<ResourceDto>>>(normal)!.pages[0].items).toHaveLength(1)
    expect(qc.getQueryData<ReturnType<typeof list<ResourceDto>>>(favorites)!.pages[0].items).toHaveLength(0)
  })
  it("does not insert newly matching rows into incomplete cursor ranges", () => {
    const qc = client(); const key = ["resources", "list", { favorite: true }]
    qc.setQueryData(key, list<ResourceDto>([], "cursor"))
    resourceCache.accept(qc, resource("a", { isFavorite: true }))
    expect(qc.getQueryData<ReturnType<typeof list<ResourceDto>>>(key)!.pages[0].items).toHaveLength(0)
  })
  it("preserves cursor metadata while sorting normalized server results", () => {
    const qc = client(); const key = ["tasks", "list", { sort: "title", order: "asc" }]
    qc.setQueryData(key, { pages: [{ items: [task("a", { title: "A" })], nextCursor: "middle" }, { items: [task("b", { title: "B" })], nextCursor: null }], pageParams: [null, "middle"] })
    taskCache.accept(qc, task("a", { title: "Z" }))
    const result = qc.getQueryData<ReturnType<typeof list<TaskDto>>>(key)!
    expect(result.pages.map((page) => page.items[0].id)).toEqual(["b", "a"])
    expect(result.pageParams).toEqual([null, "middle"])
    expect(result.pages[0].nextCursor).toBe("middle")
  })
  it("projects active patches over incoming query results", () => {
    const qc = client(); qc.setQueryData(["tasks", "detail", "a"], task("a"))
    taskCache.begin(qc, "a", (value) => value ? { ...value, status: "done" } : value)
    expect(taskCache.projectList(qc, list([task("a")]), { status: "todo" }).pages[0].items).toEqual([])
    expect(taskCache.projectList(qc, list<TaskDto>([]), { status: "done" }).pages[0].items[0].id).toBe("a")
  })
  it("evaluates tags, review, type, associations, archived state and project ancestry", () => {
    const qc = client(); qc.setQueryData(["projects", "tree"], { items: [project("parent"), project("child", "parent")] })
    expect(taskMatches(qc, task("a", { projectId: "child" }), { projectId: "parent", includeDescendants: true })).toBe(true)
    expect(taskMatches(qc, task("a", { archivedAt: "today" }), {})).toBe(false)
    expect(taskMatches(qc, task("a", { priority: "high" }), { priority: "low" })).toBe(false)
    expect(resourceMatches(qc, resource("a", { isReviewed: true }), { reviewed: false })).toBe(false)
    expect(resourceMatches(qc, resource("a", { taskCount: 1 }), { hasTasks: false })).toBe(false)
    expect(resourceMatches(qc, resource("a", { tags: [{ id: "t", name: "Tag", color: null }] }), { tag: "t", type: "note" })).toBe(true)
    expect(resourceMatches(qc, resource("a", { projects: [{ id: "child", name: "Child", icon: null, color: null }] }), { projectId: "parent", includeDescendants: true })).toBe(true)
  })
  it("defers uncertain date/descendant membership rather than guessing", () => {
    const qc = client()
    expect(taskMatches(qc, task("a", { dueDate: "2026-10-05" }), { smartFilter: "today" })).toBeUndefined()
    expect(taskMatches(qc, task("a", { dueDate: "2026-10-05", projectId: "other" }), { smartFilter: "today", projectId: "parent" })).toBe(false)
    expect(taskMatches(qc, task("a", { projectId: "child" }), { projectId: "parent", includeDescendants: true })).toBeUndefined()
    expect(taskMatches(qc, task("a", { dueDate: "2026-10-05", status: "done" }), { smartFilter: "today" })).toBe(false)
  })
  it("handles project assignment, recurrence, empty tags and completion timestamps", () => {
    const qc = client(); qc.setQueryData(["projects", "tree"], { items: [project("p")] })
    const next = applyPatch(task("a", { tags: [{ id: "t", name: "Tag", color: null }] }), { projectId: "p", rrule: "FREQ=DAILY", status: "done", tags: [] }, qc)
    expect(next).toMatchObject({ projectId: "p", project: { id: "p", name: "p" }, rrule: "FREQ=DAILY", tags: [] })
    expect(next.completedAt).not.toBeNull()
    expect(applyPatch(next, { projectId: null, rrule: null, status: "todo" }, qc)).toMatchObject({ projectId: null, project: null, rrule: null, completedAt: null })
  })
  it("rebases project movement and ancestor breadcrumbs without rolling back another project", () => {
    const qc = client(); qc.setQueryData(["projects", "tree"], { items: [project("a"), project("b"), project("child", "a")] })
    qc.setQueryData(["projects", "detail", "child"], { project: project("child", "a"), ancestors: [project("a")] })
    const token = projectCache.begin(qc, "a", "b")
    expect(projectedProject(qc, { project: project("child", "a"), ancestors: [] }).ancestors.map((item) => item.id)).toEqual(["b", "a"])
    projectCache.accept(qc, { ...project("b"), name: "New B" })
    projectCache.settle(qc, "a", token)
    expect(qc.getQueryData<{ items: ProjectDto[] }>(["projects", "tree"])!.items.find((item) => item.id === "b")!.name).toBe("New B")
    expect(qc.getQueryData<{ ancestors: ProjectDto[] }>(["projects", "detail", "child"])!.ancestors.map((item) => item.id)).toEqual(["a"])
  })
})

describe("write ordering and session safety", () => {
  it("orders conflicting writes but lets unrelated entities run in parallel", async () => {
    const queue = new WriteCoordinator(); const a = queue.reserve(["task:a"]), b = queue.reserve(["task:a"]), c = queue.reserve(["task:b"]), bulk = queue.reserve(["task:all"])
    await a.ready; await c.ready
    expect(b.waiting).toBe(true); expect(bulk.waiting).toBe(true)
    a.release(); await b.ready; expect(bulk.waiting).toBe(true)
    b.release(); c.release(); await bulk.ready; expect(bulk.waiting).toBe(false); bulk.release()
  })
  it("serializes actual mutation requests through success/rollback callbacks", async () => {
    const sync = new SyncController(); const qc = new QueryClient({ mutationCache: sync.createMutationCache() }); clients.push(qc); const disconnect = sync.connect(qc)
    const first = deferred(), events: string[] = []
    const a = qc.getMutationCache().build(qc, { ...syncMutation("task.update"), mutationFn: async () => { events.push("request a"); await first.promise }, onError: () => { events.push("rollback a") } }).execute({ id: "a", patch: { title: "bad" } }).catch(() => {})
    const b = qc.getMutationCache().build(qc, { ...syncMutation("task.update"), mutationFn: async () => { events.push("request b") } }).execute({ id: "a", patch: { title: "new" } })
    await vi.waitFor(() => expect(events).toEqual(["request a"]))
    expect(Object.values(sync.store.getState().operations).some((op) => op.phase === "paused")).toBe(true)
    first.reject(new ApiClientError(400, "Rejected")); await a; await b
    expect(events).toEqual(["request a", "rollback a", "request b"]); disconnect()
  })
  it("does not apply old mutation callbacks or execute queued writes after session reset", async () => {
    const sync = new SyncController(); const qc = new QueryClient({ mutationCache: sync.createMutationCache() }); clients.push(qc); const disconnect = sync.connect(qc)
    const first = deferred(); const started = vi.fn(), stale = vi.fn(), queued = vi.fn()
    const a = qc.getMutationCache().build(qc, { ...syncMutation("task.update"), mutationFn: async () => { started(); await first.promise }, onSuccess: stale }).execute({ id: "a", patch: {} })
    const b = qc.getMutationCache().build(qc, { ...syncMutation("task.update"), mutationFn: queued }).execute({ id: "a", patch: {} }).catch(() => {})
    await vi.waitFor(() => expect(started).toHaveBeenCalled())
    sync.reset(); resetJournals(qc); first.resolve(); await a; await b
    expect(stale).not.toHaveBeenCalled(); expect(queued).not.toHaveBeenCalled(); disconnect()
  })
})

describe("latest note draft acknowledgment and recovery", () => {
  it("keeps newer typing dirty when an older save finishes", async () => {
    const drafts = new NoteDrafts(), request = deferred(); drafts.edit("task:a", { value: "first" }, "first")
    const saving = drafts.save("task:a", () => request.promise)
    drafts.edit("task:a", { value: "second" }, "second"); request.resolve(); await saving
    expect(drafts.get("task:a")).toMatchObject({ phase: "dirty", text: "second" }); drafts.reset()
  })
  it("preserves failed payloads for reopening and discards successful payloads", async () => {
    vi.useFakeTimers(); const drafts = new NoteDrafts(); drafts.edit("resource:a", { value: "draft" }, "draft")
    await expect(drafts.save("resource:a", async () => { throw new Error("Failed") })).rejects.toThrow()
    expect(drafts.get("resource:a")).toMatchObject({ phase: "failed", doc: { value: "draft" }, text: "draft" })
    await drafts.save("resource:a", async () => {})
    expect(drafts.get("resource:a")).toMatchObject({ phase: "saved" }); expect(drafts.get("resource:a")?.doc).toBeUndefined()
    vi.advanceTimersByTime(2000); expect(drafts.get("resource:a")).toBeUndefined(); drafts.reset()
  })
  it("does not resurrect drafts after logout, discard, or a newer failed save", async () => {
    const drafts = new NoteDrafts(), old = deferred(); drafts.edit("task:a", { value: "old" }, "old")
    const saving = drafts.save("task:a", () => old.promise).catch(() => {})
    drafts.reset(); old.reject(new Error("late")); await saving; expect(drafts.get("task:a")).toBeUndefined()
    drafts.edit("task:a", { value: "new" }, "new"); drafts.discard("task:a"); expect(drafts.get("task:a")).toBeUndefined()
  })
  it("keeps shared optimistic settings patches independent", () => {
    const qc = client(), journal = journalFor<{ view: string; timezone: string }>(qc, "settings"), write = vi.fn()
    const a = journal.begin("settings", { view: "grid", timezone: "UTC" }, (value) => value ? { ...value, view: "list" } : value, write)
    const b = journal.begin("settings", null, (value) => value ? { ...value, timezone: "Asia/Kolkata" } : value, write)
    journal.settle("settings", a)
    expect(write).toHaveBeenLastCalledWith({ view: "grid", timezone: "Asia/Kolkata" })
    journal.settle("settings", b)
  })
})
