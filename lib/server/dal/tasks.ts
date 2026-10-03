import "server-only"

import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

import { db } from "@/lib/db"
import {
  projects,
  resources as resourcesTable,
  taskChecklistItems,
  taskReminders,
  taskResources,
  tasks,
  taskTags,
  tags,
} from "@/lib/db/schema"
import { nextSortKey, sortKeyBetween } from "@/lib/projects/sort-key"
import { withUntil } from "@/lib/tasks/recurrence"
import type {
  ChecklistItemDto,
  TaskDto,
  TaskPage,
  TaskPriority,
  TaskStatus,
} from "@/lib/tasks/types"
import type {
  CreateTaskInput,
  ListTasksQuery,
  MoveTaskInput,
  UpdateTaskInput,
} from "@/lib/validation/tasks"

import { ensureTags } from "./tags"

type TaskRow = typeof tasks.$inferSelect

// ------------------------------------------------------------------ mapping

function checklistDto(row: typeof taskChecklistItems.$inferSelect): ChecklistItemDto {
  return { id: row.id, title: row.title, done: row.done, sortKey: row.sortKey }
}

async function checklistForTasks(
  taskIds: string[]
): Promise<Map<string, ChecklistItemDto[]>> {
  const map = new Map<string, ChecklistItemDto[]>()
  if (!taskIds.length) return map
  const rows = await db
    .select()
    .from(taskChecklistItems)
    .where(inArray(taskChecklistItems.taskId, taskIds))
    .orderBy(asc(taskChecklistItems.sortKey))
  for (const row of rows) {
    const list = map.get(row.taskId) ?? []
    list.push(checklistDto(row))
    map.set(row.taskId, list)
  }
  return map
}

async function tagsForTasks(taskIds: string[]) {
  const map = new Map<string, { id: string; name: string; color: string | null }[]>()
  if (!taskIds.length) return map
  const rows = await db
    .select({
      taskId: taskTags.taskId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(taskTags)
    .innerJoin(tags, eq(tags.id, taskTags.tagId))
    .where(inArray(taskTags.taskId, taskIds))
    .orderBy(sql`lower(${tags.name})`)
  for (const { taskId, ...tag } of rows) {
    const list = map.get(taskId) ?? []
    list.push(tag)
    map.set(taskId, list)
  }
  return map
}

async function resourcesForTasks(taskIds: string[]) {
  const map = new Map<string, TaskDto["resources"]>()
  if (!taskIds.length) return map
  const rows = await db
    .select({
      taskId: taskResources.taskId,
      id: resourcesTable.id,
      type: resourcesTable.type,
      title: resourcesTable.title,
      url: resourcesTable.url,
      metadata: resourcesTable.metadata,
      thumbnailFileId: resourcesTable.thumbnailFileId,
      metadataOverrideImage: resourcesTable.metadataOverride,
    })
    .from(taskResources)
    .innerJoin(resourcesTable, eq(resourcesTable.id, taskResources.resourceId))
    .where(and(inArray(taskResources.taskId, taskIds), isNull(resourcesTable.deletedAt)))
    .orderBy(asc(taskResources.addedAt))
  for (const row of rows) {
    const list = map.get(row.taskId) ?? []
    list.push({
      id: row.id,
      type: row.type,
      title: row.title,
      url: row.url,
      thumbnailUrl: row.thumbnailFileId
        ? `/api/files/${row.thumbnailFileId}`
        : (row.metadataOverrideImage?.image ?? row.metadata.image ?? null),
    })
    map.set(row.taskId, list)
  }
  return map
}

async function projectsForTaskRows(taskRows: TaskRow[]) {
  const ids = [...new Set(taskRows.map((r) => r.projectId).filter((id): id is string => !!id))]
  if (!ids.length) return new Map<string, TaskDto["project"]>()
  const rows = await db
    .select({ id: projects.id, name: projects.name, icon: projects.icon, color: projects.color })
    .from(projects)
    .where(inArray(projects.id, ids))
  return new Map(rows.map((r) => [r.id, r]))
}

async function remindersForTaskIds(taskIds: string[]) {
  const map = new Map<string, TaskDto["reminders"]>()
  if (!taskIds.length) return map
  const rows = await db
    .select()
    .from(taskReminders)
    .where(inArray(taskReminders.taskId, taskIds))
    .orderBy(asc(taskReminders.offsetMinutes))
  for (const row of rows) {
    const list = map.get(row.taskId) ?? []
    list.push({ id: row.id, taskId: row.taskId, offsetMinutes: row.offsetMinutes })
    map.set(row.taskId, list)
  }
  return map
}

async function toDtos(rows: TaskRow[]): Promise<TaskDto[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [checklistMap, tagMap, resourceMap, projectMap, reminderMap] = await Promise.all([
    checklistForTasks(ids),
    tagsForTasks(ids),
    resourcesForTasks(ids),
    projectsForTaskRows(rows),
    remindersForTaskIds(ids),
  ])
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    title: row.title,
    descriptionJson: (row.descriptionJson as Record<string, unknown> | null) ?? null,
    descriptionText: row.descriptionText,
    status: row.status,
    priority: row.priority,
    startAt: row.startAt?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    startDate: row.startDate,
    dueDate: row.dueDate,
    allDay: row.allDay,
    rrule: row.rrule,
    seriesId: row.seriesId,
    originalOccurrenceAt: row.originalOccurrenceAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    sortKey: row.sortKey,
    checklist: checklistMap.get(row.id) ?? [],
    tags: tagMap.get(row.id) ?? [],
    resources: resourceMap.get(row.id) ?? [],
    reminders: reminderMap.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

// ------------------------------------------------------------------ queries

function encodeCursor(value: string, id: string) {
  return Buffer.from(JSON.stringify([value, id])).toString("base64url")
}

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
      return [parsed[0], parsed[1]]
    }
  } catch {
    // fall through
  }
  return null
}

/** `scope.projectIds`, when given, scopes to those project ids — the route
 * resolves "include descendants" into this list beforehand (same pattern as
 * `listResources`). */
export async function listTasks(
  userId: string,
  query: ListTasksQuery,
  scope?: { projectIds?: string[] }
): Promise<TaskPage> {
  const now = new Date()
  const conditions: SQL[] = [eq(tasks.userId, userId), isNull(tasks.deletedAt)]
  if (!query.includeArchived) conditions.push(isNull(tasks.archivedAt))
  if (scope?.projectIds?.length) conditions.push(inArray(tasks.projectId, scope.projectIds))
  if (query.status) conditions.push(eq(tasks.status, query.status))
  if (query.priority) conditions.push(eq(tasks.priority, query.priority))
  if (query.tag) {
    conditions.push(
      sql`exists (select 1 from ${taskTags} where ${taskTags.taskId} = ${tasks.id} and ${taskTags.tagId} = ${query.tag})`
    )
  }
  switch (query.smartFilter) {
    case "today": {
      const end = new Date(now)
      end.setHours(23, 59, 59, 999)
      conditions.push(
        sql`${tasks.status} != 'done' and ((${tasks.dueAt} is not null and ${tasks.dueAt} <= ${end.toISOString()}::timestamptz) or ${tasks.dueDate} = current_date)`
      )
      break
    }
    case "upcoming":
      conditions.push(
        sql`${tasks.status} != 'done' and ((${tasks.dueAt} is not null and ${tasks.dueAt} > ${now.toISOString()}::timestamptz) or (${tasks.dueDate} is not null and ${tasks.dueDate} >= current_date))`
      )
      break
    case "overdue":
      conditions.push(
        sql`${tasks.status} != 'done' and ((${tasks.dueAt} is not null and ${tasks.dueAt} < ${now.toISOString()}::timestamptz) or (${tasks.dueDate} is not null and ${tasks.dueDate} < current_date))`
      )
      break
    case "no_date":
      conditions.push(sql`${tasks.dueAt} is null and ${tasks.dueDate} is null`)
      break
    case "completed":
      conditions.push(eq(tasks.status, "done"))
      break
  }

  const sortExpr: SQL =
    query.sort === "title"
      ? sql`lower(${tasks.title})`
      : query.sort === "due"
        ? sql`coalesce(${tasks.dueAt}, ${tasks.dueDate}::timestamptz)`
        : query.sort === "priority"
          ? sql`case ${tasks.priority} when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end`
          : query.sort === "updated"
            ? sql`${tasks.updatedAt}`
            : query.sort === "created"
              ? sql`${tasks.createdAt}`
              : sql`${tasks.sortKey}`
  const cast = sql.raw(query.sort === "title" || query.sort === "sortKey" ? "" : "::timestamptz")

  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  if (cursor) {
    const [value, id] = cursor
    const sortValueCast = query.sort === "title" || query.sort === "sortKey" ? sql`${value}` : sql`${value}${cast}`
    conditions.push(
      query.order === "desc"
        ? sql`(${sortExpr}, ${tasks.id}) < (${sortValueCast}, ${id}::uuid)`
        : sql`(${sortExpr}, ${tasks.id}) > (${sortValueCast}, ${id}::uuid)`
    )
  }

  const direction = query.order === "desc" ? desc : asc
  const rows = await db
    .select({ row: tasks, sortValue: sql<string>`(${sortExpr})::text` })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(direction(sortExpr), direction(tasks.id))
    .limit(query.limit + 1)

  const page = rows.slice(0, query.limit)
  const last = page.at(-1)
  return {
    items: await toDtos(page.map((r) => r.row)),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.sortValue, last.row.id) : null,
  }
}

export type SmartFilterCounts = Record<
  "today" | "upcoming" | "overdue" | "no_date" | "completed",
  number
>

/** Counts for the sidebar's smart-filter rows; mirrors `listTasks`'s per-filter conditions. */
export async function smartFilterCounts(userId: string): Promise<SmartFilterCounts> {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const base = and(eq(tasks.userId, userId), isNull(tasks.deletedAt), isNull(tasks.archivedAt))
  const [row] = await db
    .select({
      today: sql<number>`count(*) filter (where ${tasks.status} != 'done' and ((${tasks.dueAt} is not null and ${tasks.dueAt} <= ${end.toISOString()}::timestamptz) or ${tasks.dueDate} = current_date))::int`,
      upcoming: sql<number>`count(*) filter (where ${tasks.status} != 'done' and ((${tasks.dueAt} is not null and ${tasks.dueAt} > now()) or (${tasks.dueDate} is not null and ${tasks.dueDate} >= current_date)))::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.status} != 'done' and ((${tasks.dueAt} is not null and ${tasks.dueAt} < now()) or (${tasks.dueDate} is not null and ${tasks.dueDate} < current_date)))::int`,
      noDate: sql<number>`count(*) filter (where ${tasks.dueAt} is null and ${tasks.dueDate} is null and ${tasks.status} != 'done')::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(base)
  return {
    today: row?.today ?? 0,
    upcoming: row?.upcoming ?? 0,
    overdue: row?.overdue ?? 0,
    no_date: row?.noDate ?? 0,
    completed: row?.completed ?? 0,
  }
}

export async function getTaskRow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1)
  return row ?? null
}

export async function getTask(userId: string, id: string): Promise<TaskDto | null> {
  const row = await getTaskRow(userId, id)
  if (!row) return null
  const [dto] = await toDtos([row])
  return dto ?? null
}

async function assertProjectOwnership(userId: string, projectId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), isNull(projects.deletedAt)))
    .limit(1)
  return !!row
}

export async function createTask(
  userId: string,
  input: CreateTaskInput
): Promise<TaskDto | null> {
  if (input.projectId && !(await assertProjectOwnership(userId, input.projectId))) return null
  const id = uuidv7()
  const [last] = await db
    .select({ sortKey: tasks.sortKey })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, input.status ?? "todo")))
    .orderBy(sql`${tasks.sortKey} desc`)
    .limit(1)

  await db.transaction(async (tx) => {
    await tx.insert(tasks).values({
      id,
      userId,
      projectId: input.projectId ?? null,
      title: input.title.trim(),
      descriptionJson: input.descriptionJson ?? null,
      descriptionText: input.descriptionText ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? "medium",
      startAt: input.startAt ? new Date(input.startAt) : null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      allDay: input.allDay ?? false,
      rrule: input.rrule ?? null,
      sortKey: nextSortKey(last?.sortKey ?? null),
    })
    if (input.tags?.length) {
      const tagIds = await ensureTags(tx, userId, input.tags)
      if (tagIds.length) {
        await tx.insert(taskTags).values(tagIds.map((tagId) => ({ taskId: id, tagId }))).onConflictDoNothing()
      }
    }
    if (input.resourceIds?.length) {
      const owned = await tx
        .select({ id: resourcesTable.id })
        .from(resourcesTable)
        .where(and(eq(resourcesTable.userId, userId), inArray(resourcesTable.id, input.resourceIds)))
      if (owned.length) {
        await tx
          .insert(taskResources)
          .values(owned.map((r) => ({ taskId: id, resourceId: r.id })))
          .onConflictDoNothing()
      }
    }
  })
  return getTask(userId, id)
}

export async function updateTask(
  userId: string,
  id: string,
  patch: UpdateTaskInput
): Promise<TaskDto | null> {
  const existing = await getTaskRow(userId, id)
  if (!existing) return null
  if (patch.projectId && !(await assertProjectOwnership(userId, patch.projectId))) return null

  const set: Partial<TaskRow> = { updatedAt: new Date() }
  if (patch.title !== undefined) set.title = patch.title.trim()
  if (patch.projectId !== undefined) set.projectId = patch.projectId
  if (patch.descriptionJson !== undefined) set.descriptionJson = patch.descriptionJson
  if (patch.descriptionText !== undefined) set.descriptionText = patch.descriptionText
  if (patch.priority !== undefined) set.priority = patch.priority
  if (patch.startAt !== undefined) set.startAt = patch.startAt ? new Date(patch.startAt) : null
  if (patch.dueAt !== undefined) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null
  if (patch.startDate !== undefined) set.startDate = patch.startDate
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate
  if (patch.allDay !== undefined) set.allDay = patch.allDay
  if (patch.rrule !== undefined) set.rrule = patch.rrule
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null
  if (patch.status !== undefined) {
    set.status = patch.status
    if (patch.status === "done" && existing.status !== "done") set.completedAt = new Date()
    else if (patch.status !== "done" && existing.status === "done") set.completedAt = null
  }

  await db.transaction(async (tx) => {
    await tx.update(tasks).set(set).where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    if (patch.tags) {
      const tagIds = await ensureTags(tx, userId, patch.tags)
      await tx.delete(taskTags).where(eq(taskTags.taskId, id))
      if (tagIds.length) {
        await tx.insert(taskTags).values(tagIds.map((tagId) => ({ taskId: id, tagId }))).onConflictDoNothing()
      }
    }
  })
  return getTask(userId, id)
}

export type MoveTaskResult = { ok: true; dto: TaskDto } | { ok: false }

/** Board DnD: changes `status` and recomputes a fractional `sortKey` among
 * the destination column's siblings (shared order field for both views). */
export async function moveTask(
  userId: string,
  id: string,
  input: MoveTaskInput
): Promise<MoveTaskResult> {
  const existing = await getTaskRow(userId, id)
  if (!existing) return { ok: false }

  const siblings = await db
    .select({ id: tasks.id, sortKey: tasks.sortKey })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, input.status),
        isNull(tasks.deletedAt),
        sql`${tasks.id} != ${id}`
      )
    )
    .orderBy(asc(tasks.sortKey))

  let sortKey: string
  const beforeIdx = input.beforeId ? siblings.findIndex((s) => s.id === input.beforeId) : -1
  const afterIdx = input.afterId ? siblings.findIndex((s) => s.id === input.afterId) : -1
  if (beforeIdx >= 0) {
    sortKey = sortKeyBetween(siblings[beforeIdx - 1]?.sortKey ?? null, siblings[beforeIdx]!.sortKey)
  } else if (afterIdx >= 0) {
    sortKey = sortKeyBetween(siblings[afterIdx]!.sortKey, siblings[afterIdx + 1]?.sortKey ?? null)
  } else {
    sortKey = nextSortKey(siblings.at(-1)?.sortKey ?? null)
  }

  const set: Partial<TaskRow> = { status: input.status, sortKey, updatedAt: new Date() }
  if (input.status === "done" && existing.status !== "done") set.completedAt = new Date()
  else if (input.status !== "done" && existing.status === "done") set.completedAt = null

  await db.update(tasks).set(set).where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
  const dto = await getTask(userId, id)
  return dto ? { ok: true, dto } : { ok: false }
}

export async function duplicateTask(userId: string, id: string): Promise<TaskDto | null> {
  const existing = await getTaskRow(userId, id)
  if (!existing) return null
  const [checklist, tagRows] = await Promise.all([
    db.select().from(taskChecklistItems).where(eq(taskChecklistItems.taskId, id)).orderBy(asc(taskChecklistItems.sortKey)),
    db.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, id)),
  ])
  const newId = uuidv7()
  const [last] = await db
    .select({ sortKey: tasks.sortKey })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, existing.status)))
    .orderBy(sql`${tasks.sortKey} desc`)
    .limit(1)

  await db.transaction(async (tx) => {
    await tx.insert(tasks).values({
      id: newId,
      userId,
      projectId: existing.projectId,
      title: existing.title,
      descriptionJson: existing.descriptionJson,
      descriptionText: existing.descriptionText,
      status: existing.status,
      priority: existing.priority,
      startAt: existing.startAt,
      dueAt: existing.dueAt,
      startDate: existing.startDate,
      dueDate: existing.dueDate,
      allDay: existing.allDay,
      sortKey: nextSortKey(last?.sortKey ?? null),
    })
    if (tagRows.length) {
      await tx
        .insert(taskTags)
        .values(tagRows.map((t) => ({ taskId: newId, tagId: t.tagId })))
        .onConflictDoNothing()
    }
    if (checklist.length) {
      await tx.insert(taskChecklistItems).values(
        checklist.map((item) => ({
          id: uuidv7(),
          taskId: newId,
          title: item.title,
          done: false,
          sortKey: item.sortKey,
        }))
      )
    }
  })
  return getTask(userId, newId)
}

// ------------------------------------------------------------------ occurrence edits

export type EditOccurrenceResult =
  | { ok: true; dto: TaskDto; detachedId?: string }
  | { ok: false; reason: "not_found" | "not_recurring" }

/** Clones a series master's fields into a new standalone row (used to
 * detach a single occurrence, or to start a new series for "following"). */
async function cloneTaskRow(
  tx: Parameters<Parameters<(typeof db)["transaction"]>[0]>[0],
  master: TaskRow,
  overrides: Partial<TaskRow>,
  newId: string
) {
  const [last] = await tx
    .select({ sortKey: tasks.sortKey })
    .from(tasks)
    .where(and(eq(tasks.userId, master.userId), eq(tasks.status, master.status)))
    .orderBy(sql`${tasks.sortKey} desc`)
    .limit(1)
  await tx.insert(tasks).values({
    id: newId,
    userId: master.userId,
    projectId: master.projectId,
    title: master.title,
    descriptionJson: master.descriptionJson,
    descriptionText: master.descriptionText,
    status: master.status,
    priority: master.priority,
    startAt: master.startAt,
    dueAt: master.dueAt,
    startDate: master.startDate,
    dueDate: master.dueDate,
    allDay: master.allDay,
    rrule: null,
    seriesId: null,
    originalOccurrenceAt: null,
    sortKey: nextSortKey(last?.sortKey ?? null),
    ...overrides,
  })
  const tagRows = await tx.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, master.id))
  if (tagRows.length) {
    await tx
      .insert(taskTags)
      .values(tagRows.map((t) => ({ taskId: newId, tagId: t.tagId })))
      .onConflictDoNothing()
  }
}

/** The recurring series' anchor instant — derives from whichever date field
 * the task actually has set, since `rrule` stores only the pattern. Shared
 * with the calendar's occurrence expansion. */
export function taskDtstart(row: Pick<TaskRow, "startAt" | "dueAt" | "startDate" | "dueDate">): Date {
  if (row.startAt) return row.startAt
  if (row.dueAt) return row.dueAt
  if (row.startDate) return new Date(`${row.startDate}T00:00:00.000Z`)
  return new Date(`${row.dueDate}T00:00:00.000Z`)
}

/** Shifts a master's own start/due fields onto a specific occurrence
 * instant, preserving any start→due duration and the all-day/timed shape. */
function occurrenceOverrides(master: TaskRow, occurrenceAt: Date): Partial<TaskRow> {
  if (master.allDay) {
    const dateOnly = `${occurrenceAt.getUTCFullYear()}-${String(occurrenceAt.getUTCMonth() + 1).padStart(2, "0")}-${String(occurrenceAt.getUTCDate()).padStart(2, "0")}`
    return { startDate: master.startDate ? dateOnly : null, dueDate: dateOnly, startAt: null, dueAt: null }
  }
  const durationMs = master.startAt && master.dueAt ? master.dueAt.getTime() - master.startAt.getTime() : 0
  return {
    startAt: master.startAt ? occurrenceAt : null,
    dueAt: new Date(occurrenceAt.getTime() + durationMs),
    startDate: null,
    dueDate: null,
  }
}

/**
 * Edits one occurrence of a recurring task per `scope`:
 * - `"all"` (or a non-recurring task): a normal update on the master.
 * - `"this"`: adds `occurrenceAt` to the master's `exdates` and creates a
 *   detached exception row (`seriesId` = master id) carrying the patch —
 *   completing a single occurrence is this same path with `{status:"done"}`.
 * - `"following"`: truncates the master's `rrule` with `UNTIL` just before
 *   `occurrenceAt`, then starts a **new** series master from `occurrenceAt`
 *   (same rrule pattern — valid since `occurrenceAt` is itself one of the
 *   original rule's instants) carrying the patch.
 */
export async function editOccurrence(
  userId: string,
  taskId: string,
  occurrenceAt: Date,
  scope: "this" | "following" | "all",
  patch: UpdateTaskInput
): Promise<EditOccurrenceResult> {
  const master = await getTaskRow(userId, taskId)
  if (!master) return { ok: false, reason: "not_found" }

  if (scope === "all" || !master.rrule) {
    const dto = await updateTask(userId, taskId, patch)
    return dto ? { ok: true, dto } : { ok: false, reason: "not_found" }
  }

  if (scope === "this") {
    const newId = uuidv7()
    await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ exdates: [...(master.exdates ?? []), occurrenceAt], updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      await cloneTaskRow(
        tx,
        master,
        { ...occurrenceOverrides(master, occurrenceAt), seriesId: taskId, originalOccurrenceAt: occurrenceAt },
        newId
      )
    })
    const dto = await updateTask(userId, newId, patch)
    return dto ? { ok: true, dto, detachedId: newId } : { ok: false, reason: "not_found" }
  }

  // scope === "following"
  const dtstart = taskDtstart(master)
  const newId = uuidv7()
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ rrule: withUntil(master.rrule!, dtstart, new Date(occurrenceAt.getTime() - 1000)), updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    await cloneTaskRow(tx, master, { ...occurrenceOverrides(master, occurrenceAt), rrule: master.rrule }, newId)
  })
  const dto = await updateTask(userId, newId, patch)
  return dto ? { ok: true, dto, detachedId: newId } : { ok: false, reason: "not_found" }
}

export function completeOccurrence(userId: string, taskId: string, occurrenceAt: Date) {
  return editOccurrence(userId, taskId, occurrenceAt, "this", { status: "done" })
}

export async function softDeleteTask(userId: string, id: string) {
  const result = await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id })
  return result.length > 0
}

export async function softDeleteTasks(userId: string, ids: string[]) {
  if (!ids.length) return
  await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)))
}

// ------------------------------------------------------------------ checklist

export async function addChecklistItem(userId: string, taskId: string, title: string) {
  const task = await getTaskRow(userId, taskId)
  if (!task) return null
  const [last] = await db
    .select({ sortKey: taskChecklistItems.sortKey })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(sql`${taskChecklistItems.sortKey} desc`)
    .limit(1)
  const id = uuidv7()
  await db.insert(taskChecklistItems).values({
    id,
    taskId,
    title: title.trim(),
    sortKey: nextSortKey(last?.sortKey ?? null),
  })
  return getTask(userId, taskId)
}

export async function updateChecklistItem(
  userId: string,
  taskId: string,
  itemId: string,
  patch: { title?: string; done?: boolean }
) {
  const task = await getTaskRow(userId, taskId)
  if (!task) return null
  const set: Partial<typeof taskChecklistItems.$inferInsert> = {}
  if (patch.title !== undefined) set.title = patch.title.trim()
  if (patch.done !== undefined) set.done = patch.done
  await db
    .update(taskChecklistItems)
    .set(set)
    .where(and(eq(taskChecklistItems.id, itemId), eq(taskChecklistItems.taskId, taskId)))
  return getTask(userId, taskId)
}

export async function deleteChecklistItem(userId: string, taskId: string, itemId: string) {
  const task = await getTaskRow(userId, taskId)
  if (!task) return null
  await db
    .delete(taskChecklistItems)
    .where(and(eq(taskChecklistItems.id, itemId), eq(taskChecklistItems.taskId, taskId)))
  return getTask(userId, taskId)
}

export async function reorderChecklistItem(
  userId: string,
  taskId: string,
  itemId: string,
  anchors: { beforeId?: string; afterId?: string }
) {
  const task = await getTaskRow(userId, taskId)
  if (!task) return null
  const siblings = await db
    .select({ id: taskChecklistItems.id, sortKey: taskChecklistItems.sortKey })
    .from(taskChecklistItems)
    .where(and(eq(taskChecklistItems.taskId, taskId), sql`${taskChecklistItems.id} != ${itemId}`))
    .orderBy(asc(taskChecklistItems.sortKey))

  let sortKey: string
  const beforeIdx = anchors.beforeId ? siblings.findIndex((s) => s.id === anchors.beforeId) : -1
  const afterIdx = anchors.afterId ? siblings.findIndex((s) => s.id === anchors.afterId) : -1
  if (beforeIdx >= 0) {
    sortKey = sortKeyBetween(siblings[beforeIdx - 1]?.sortKey ?? null, siblings[beforeIdx]!.sortKey)
  } else if (afterIdx >= 0) {
    sortKey = sortKeyBetween(siblings[afterIdx]!.sortKey, siblings[afterIdx + 1]?.sortKey ?? null)
  } else {
    sortKey = nextSortKey(siblings.at(-1)?.sortKey ?? null)
  }
  await db.update(taskChecklistItems).set({ sortKey }).where(eq(taskChecklistItems.id, itemId))
  return getTask(userId, taskId)
}

// ------------------------------------------------------------------ resource links

export async function linkTaskResources(userId: string, taskId: string, resourceIds: string[]) {
  const task = await getTaskRow(userId, taskId)
  if (!task) return false
  const owned = await db
    .select({ id: resourcesTable.id })
    .from(resourcesTable)
    .where(and(eq(resourcesTable.userId, userId), inArray(resourcesTable.id, resourceIds)))
  if (!owned.length) return true
  await db
    .insert(taskResources)
    .values(owned.map((r) => ({ taskId, resourceId: r.id })))
    .onConflictDoNothing()
  return true
}

export async function unlinkTaskResources(userId: string, taskId: string, resourceIds: string[]) {
  const task = await getTaskRow(userId, taskId)
  if (!task) return false
  await db
    .delete(taskResources)
    .where(and(eq(taskResources.taskId, taskId), inArray(taskResources.resourceId, resourceIds)))
  return true
}

export type TaskForResourceDto = {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  dueAt: string | null
}

export async function tasksForResource(userId: string, resourceId: string): Promise<TaskForResourceDto[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
    })
    .from(taskResources)
    .innerJoin(tasks, eq(tasks.id, taskResources.taskId))
    .where(
      and(
        eq(taskResources.resourceId, resourceId),
        eq(tasks.userId, userId),
        isNull(tasks.deletedAt)
      )
    )
    .orderBy(asc(tasks.sortKey))
  return rows.map((r) => ({ ...r, dueAt: r.dueAt?.toISOString() ?? null }))
}

export async function taskCountsForResources(resourceIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!resourceIds.length) return map
  const rows = await db
    .select({ resourceId: taskResources.resourceId, count: sql<number>`count(*)::int` })
    .from(taskResources)
    .innerJoin(tasks, eq(tasks.id, taskResources.taskId))
    .where(and(inArray(taskResources.resourceId, resourceIds), isNull(tasks.deletedAt)))
    .groupBy(taskResources.resourceId)
  for (const row of rows) map.set(row.resourceId, row.count)
  return map
}

// ------------------------------------------------------------------ bulk + project rollups

export async function bulkSetStatus(userId: string, ids: string[], status: TaskStatus) {
  if (!ids.length) return
  const set: Partial<TaskRow> = { status, updatedAt: new Date() }
  if (status === "done") set.completedAt = new Date()
  else set.completedAt = null
  await db.update(tasks).set(set).where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)))
}

export async function bulkSetPriority(userId: string, ids: string[], priority: TaskPriority) {
  if (!ids.length) return
  await db
    .update(tasks)
    .set({ priority, updatedAt: new Date() })
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)))
}

export async function bulkSetProject(userId: string, ids: string[], projectId: string | null) {
  if (!ids.length) return
  if (projectId && !(await assertProjectOwnership(userId, projectId))) return
  await db
    .update(tasks)
    .set({ projectId, updatedAt: new Date() })
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)))
}

export async function bulkAddTags(userId: string, ids: string[], names: string[]) {
  if (!ids.length || !names.length) return
  await db.transaction(async (tx) => {
    const tagIds = await ensureTags(tx, userId, names)
    if (!tagIds.length) return
    await tx
      .insert(taskTags)
      .values(ids.flatMap((taskId) => tagIds.map((tagId) => ({ taskId, tagId }))))
      .onConflictDoNothing()
  })
}

export async function bulkRemoveTagsByName(userId: string, ids: string[], names: string[]) {
  if (!ids.length || !names.length) return
  const normalized = names.map((n) => n.trim().replace(/^#/, "").toLowerCase()).filter(Boolean)
  if (!normalized.length) return
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.nameNormalized, normalized)))
  const tagIds = rows.map((r) => r.id)
  if (!tagIds.length) return
  await db
    .delete(taskTags)
    .where(and(inArray(taskTags.taskId, ids), inArray(taskTags.tagId, tagIds)))
}

/** Done-vs-total counts for a project (and, optionally, its descendants). */
export async function taskProgressForProjects(
  userId: string,
  projectIds: string[]
): Promise<{ done: number; total: number }> {
  if (!projectIds.length) return { done: 0, total: 0 }
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.projectId, projectIds),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt)
      )
    )
  return row ?? { done: 0, total: 0 }
}
