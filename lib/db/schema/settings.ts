import { pgEnum, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core"

import { user } from "./auth"

export const libraryViewEnum = pgEnum("library_view", ["grid", "list", "focus"])

export const calendarColorModeEnum = pgEnum("calendar_color_mode", [
  "project",
  "priority",
  "status",
])

export const userSettings = pgTable("user_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timezone: text().notNull().default("UTC"),
  /** 0 = Sunday, 1 = Monday */
  weekStart: smallint().notNull().default(1),
  calendarColorMode: calendarColorModeEnum().notNull().default("project"),
  libraryView: libraryViewEnum().notNull().default("grid"),
  icsToken: text().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
