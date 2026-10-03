import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
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

/** Freeform scratchpad entries: an optional title plus a Tiptap document.
 * Unlike resources/tasks these aren't meant to be organized — the user
 * turns the useful ones into a resource or task themselves later. */
export const quickNotes = pgTable(
  "quick_notes",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    title: text(),
    bodyJson: jsonb(),
    bodyText: text(),
    ...timestamps,
  },
  (t) => [
    index("quick_notes_user_updated_idx").on(t.userId, t.updatedAt.desc()),
    index("quick_notes_project_idx").on(t.projectId),
  ]
)
