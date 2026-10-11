import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import type { HabitConfig, HabitInput, HabitStatus } from "@/lib/habits/model"

export const habits = pgTable(
  "habits",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    reason: text().notNull().default(""),
    icon: text().$type<HabitInput["icon"]>().notNull(),
    color: text().$type<HabitInput["color"]>().notNull(),
    status: text().$type<HabitStatus>().notNull().default("active"),
    revision: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("habits_user_idx").on(t.userId)]
)
export const habitVersions = pgTable(
  "habit_versions",
  {
    id: uuid().primaryKey(),
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    revision: integer().notNull(),
    effectiveFrom: date().notNull(),
    config: jsonb().$type<HabitConfig>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("habit_versions_date_idx").on(t.habitId, t.effectiveFrom)]
)
export const habitOccurrences = pgTable(
  "habit_occurrences",
  {
    id: uuid().primaryKey(),
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    versionId: uuid()
      .notNull()
      .references(() => habitVersions.id, { onDelete: "cascade" }),
    periodStart: date().notNull(),
    periodEnd: date().notNull(),
    celebratedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("habit_occurrences_period_idx").on(
      t.habitId,
      t.versionId,
      t.periodStart,
      t.periodEnd
    ),
  ]
)
export const habitLogs = pgTable(
  "habit_logs",
  {
    id: uuid().primaryKey(),
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    occurrenceId: uuid()
      .notNull()
      .references(() => habitOccurrences.id, { onDelete: "cascade" }),
    date: date().notNull(),
    kind: text().$type<"progress" | "skip">().notNull(),
    amount: numeric({ precision: 12, scale: 3, mode: "number" }).notNull(),
    notes: text().notNull().default(""),
    timezone: text().notNull(),
    revision: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("habit_logs_date_idx").on(t.habitId, t.date)]
)
export const habitStates = pgTable(
  "habit_states",
  {
    id: uuid().primaryKey(),
    habitId: uuid()
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    status: text().$type<HabitStatus>().notNull(),
    date: date().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("habit_states_habit_idx").on(t.habitId)]
)
