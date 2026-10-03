import { sql, type SQL } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  customType,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./auth"
import { projects } from "./projects"
import { resources, tags } from "./resources"

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
})

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "blocked",
  "done",
])

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
])

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const tasks = pgTable(
  "tasks",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    title: text().notNull(),
    descriptionJson: jsonb(),
    descriptionText: text(),
    status: taskStatusEnum().notNull().default("todo"),
    priority: taskPriorityEnum().notNull().default("medium"),
    startAt: timestamp({ withTimezone: true }),
    dueAt: timestamp({ withTimezone: true }),
    startDate: date(),
    dueDate: date(),
    allDay: boolean().notNull().default(false),
    rrule: text(),
    exdates: timestamp({ withTimezone: true }).array(),
    seriesId: uuid(),
    originalOccurrenceAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    sortKey: text().notNull(),
    search: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple', coalesce(${tasks.title}, '')), 'A') || setweight(to_tsvector('simple', coalesce(${tasks.descriptionText}, '')), 'C')`
    ),
    ...timestamps,
  },
  (t) => [
    index("tasks_user_deleted_idx").on(t.userId, t.deletedAt, t.createdAt.desc()),
    index("tasks_user_status_idx").on(t.userId, t.status, t.deletedAt),
    index("tasks_user_due_idx").on(t.userId, t.dueAt),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_search_idx").using("gin", t.search),
  ]
)

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: uuid().primaryKey(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text().notNull(),
    done: boolean().notNull().default(false),
    sortKey: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_checklist_items_task_idx").on(t.taskId, t.sortKey)]
)

export const taskResources = pgTable(
  "task_resources",
  {
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.resourceId] }),
    index("task_resources_resource_idx").on(t.resourceId),
  ]
)

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.tagId] }),
    index("task_tags_tag_idx").on(t.tagId),
  ]
)

export const taskReminders = pgTable(
  "task_reminders",
  {
    id: uuid().primaryKey(),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Minutes before the occurrence's due time (0 = at time). */
    offsetMinutes: integer().notNull(),
    /** The specific occurrence (its due instant) this reminder was last
     * dismissed for; a recurring task's next occurrence fires again. */
    dismissedFor: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_reminders_task_idx").on(t.taskId)]
)

