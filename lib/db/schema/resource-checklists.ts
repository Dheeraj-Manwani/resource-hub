import { boolean, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core"

import { projects } from "./projects"
import { resources } from "./resources"

export const resourceChecklists = pgTable("resource_checklists", {
  projectId: uuid()
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  enabled: boolean().notNull().default(false),
})

// Only checked resources need a row. Reset removes the current checkmarks.
export const resourceChecklistChecks = pgTable(
  "resource_checklist_checks",
  {
    projectId: uuid()
      .notNull()
      .references(() => resourceChecklists.projectId, { onDelete: "cascade" }),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.resourceId] })]
)
