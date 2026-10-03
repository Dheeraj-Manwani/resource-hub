import { sql, type SQL } from "drizzle-orm"
import {
  customType,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { user } from "./auth"
import { resources } from "./resources"

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
})

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const projects = pgTable(
  "projects",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => projects.id, {
      onDelete: "set null",
    }),
    name: text().notNull(),
    description: text(),
    icon: text(),
    color: text(),
    sortKey: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    search: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple', coalesce(${projects.name}, '')), 'A') || setweight(to_tsvector('simple', coalesce(${projects.description}, '')), 'C')`
    ),
    ...timestamps,
  },
  (t) => [
    index("projects_user_parent_idx").on(t.userId, t.parentId, t.sortKey),
    index("projects_user_deleted_idx").on(t.userId, t.deletedAt),
    index("projects_search_idx").using("gin", t.search),
    index("projects_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ]
)

export const projectResources = pgTable(
  "project_resources",
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    sortKey: text().notNull(),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.resourceId] }),
    index("project_resources_resource_idx").on(t.resourceId),
  ]
)
