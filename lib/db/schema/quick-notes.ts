import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core"

import { user } from "./auth"
import { projects } from "./projects"

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/** Text and spreadsheet docs. Keep the original table name to preserve notes. */
export const quickNotes = pgTable(
  "quick_notes",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    title: text(),
    kind: text({ enum: ["text", "spreadsheet"] })
      .notNull()
      .default("text"),
    revision: integer().notNull().default(0),
    deletedAt: timestamp({ withTimezone: true }),
    bodyJson: jsonb(),
    bodyText: text(),
    ...timestamps,
  },
  (t) => [
    index("quick_notes_user_updated_idx").on(t.userId, t.updatedAt.desc()),
    index("quick_notes_project_idx").on(t.projectId),
  ]
)

/** Immutable recovery snapshots, scoped through their owning document. */
export const docVersions = pgTable(
  "doc_versions",
  {
    docId: uuid()
      .notNull()
      .references(() => quickNotes.id, { onDelete: "cascade" }),
    revision: integer().notNull(),
    title: text(),
    bodyJson: jsonb(),
    bodyText: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.docId, t.revision] })]
)
