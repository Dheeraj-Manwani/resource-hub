import { sql, type SQL } from "drizzle-orm"
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import type { ResourceMetadata } from "@/lib/resources/types"

import { user } from "./auth"

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
})

export const resourceTypeEnum = pgEnum("resource_type", [
  "instagram",
  "youtube",
  "x",
  "github",
  "pinterest",
  "link",
  "image",
  "note",
  "file",
])

export const metadataStatusEnum = pgEnum("metadata_status", [
  "pending",
  "ok",
  "failed",
])

export const embedStatusEnum = pgEnum("embed_status", [
  "unknown",
  "ok",
  "unavailable",
])

export const fileRoleEnum = pgEnum("file_role", [
  "original",
  "thumbnail",
  "preview",
])

export const fileStatusEnum = pgEnum("file_status", [
  "pending",
  "ready",
  "deleting",
])

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const resources = pgTable(
  "resources",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: resourceTypeEnum().notNull(),
    url: text(),
    urlNormalized: text(),
    title: text(),
    description: text(),
    notes: text(),
    /** Tiptap JSON for note resources. */
    bodyJson: jsonb(),
    metadata: jsonb().$type<ResourceMetadata>().notNull().default({}),
    metadataOverride: jsonb().$type<Partial<ResourceMetadata>>(),
    metadataStatus: metadataStatusEnum().notNull().default("pending"),
    metadataFetchedAt: timestamp({ withTimezone: true }),
    embedStatus: embedStatusEnum().notNull().default("unknown"),
    thumbnailFileId: uuid(),
    isFavorite: boolean().notNull().default(false),
    isReviewed: boolean().notNull().default(false),
    /** Plain text of a note body, or text extracted from a file. */
    extractedText: text(),
    search: tsvector().generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('simple', coalesce(${resources.title}, '')), 'A') || setweight(to_tsvector('simple', coalesce(${resources.description}, '')), 'B') || setweight(to_tsvector('simple', coalesce(${resources.notes}, '') || ' ' || coalesce(${resources.extractedText}, '')), 'C')`
    ),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("resources_user_created_idx").on(
      t.userId,
      t.deletedAt,
      t.createdAt.desc(),
      t.id.desc()
    ),
    index("resources_user_url_idx").on(t.userId, t.urlNormalized),
    index("resources_search_idx").using("gin", t.search),
  ]
)

export const files = pgTable(
  "files",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    resourceId: uuid().references(() => resources.id, {
      onDelete: "set null",
    }),
    role: fileRoleEnum().notNull().default("original"),
    r2Key: text().notNull().unique(),
    name: text().notNull(),
    mime: text().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    width: integer(),
    height: integer(),
    status: fileStatusEnum().notNull().default("pending"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("files_user_idx").on(t.userId, t.status, t.createdAt),
    index("files_resource_idx").on(t.resourceId),
  ]
)

export const tags = pgTable(
  "tags",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    nameNormalized: text().notNull(),
    color: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_user_name_idx").on(t.userId, t.nameNormalized)]
)

export const resourceTags = pgTable(
  "resource_tags",
  {
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.tagId] }),
    index("resource_tags_tag_idx").on(t.tagId),
  ]
)

export const jobs = pgTable(
  "jobs",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    attempts: integer().notNull().default(0),
    runAfter: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_due_idx").on(t.runAfter)]
)

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().notNull(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })]
)

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    /** First characters of the token, shown in Settings to identify it. */
    prefix: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)]
)
