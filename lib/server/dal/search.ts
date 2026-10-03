import "server-only"

import { and, desc, eq, exists, gte, lte, sql, type SQL } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  projectResources,
  projects,
  resourceTags,
  resources,
  taskResources,
  tags,
  taskTags,
  tasks,
} from "@/lib/db/schema"
import { SNIPPET_END, SNIPPET_START } from "@/lib/search/snippet"
import type { ResourceType } from "@/lib/resources/types"
import type { SearchQuery } from "@/lib/validation/search"

import { getDescendantIds } from "./projects"

const HEADLINE_OPTS = `StartSel=${SNIPPET_START},StopSel=${SNIPPET_END},MaxFragments=1,MaxWords=20,MinWords=4,HighlightAll=false`

export type SearchHit = {
  id: string
  entityType: "resource" | "task" | "project" | "tag"
  title: string
  snippet: string | null
  url: string | null
  resourceType: ResourceType | null
  color: string | null
  createdAt: string
}

export type SearchResults = {
  resources: SearchHit[]
  tasks: SearchHit[]
  projects: SearchHit[]
  tags: SearchHit[]
}

function tsq(q: string): SQL {
  return sql`websearch_to_tsquery('simple', ${q})`
}

async function searchResources(
  userId: string,
  query: SearchQuery,
  projectIds: string[] | undefined,
  limit: number
): Promise<SearchHit[]> {
  const q = query.q
  const conditions: SQL[] = [eq(resources.userId, userId), sql`${resources.deletedAt} is null`]
  if (query.resourceType) conditions.push(eq(resources.type, query.resourceType))
  if (query.favorite !== undefined) conditions.push(eq(resources.isFavorite, query.favorite))
  if (query.tag) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(resourceTags)
          .where(and(eq(resourceTags.resourceId, resources.id), eq(resourceTags.tagId, query.tag!)))
      )
    )
  }
  if (projectIds) {
    conditions.push(
      projectIds.length
        ? exists(
            db
              .select({ one: sql`1` })
              .from(projectResources)
              .where(
                and(
                  eq(projectResources.resourceId, resources.id),
                  sql`${projectResources.projectId} = any(${projectIds})`
                )
              )
          )
        : sql`false`
    )
  }
  if (query.linked !== undefined) {
    const linked = exists(
      db.select({ one: sql`1` }).from(taskResources).where(eq(taskResources.resourceId, resources.id))
    )
    conditions.push(query.linked ? linked : sql`not (${linked})`)
  }
  if (query.from) conditions.push(gte(resources.createdAt, new Date(query.from)))
  if (query.to) conditions.push(lte(resources.createdAt, new Date(query.to)))

  let rank: SQL | undefined
  if (q) {
    const query_ = tsq(q)
    conditions.push(
      sql`(${resources.search} @@ ${query_} or word_similarity(${q}, coalesce(${resources.title}, '')) > 0.3)`
    )
    rank = sql`greatest(ts_rank(${resources.search}, ${query_}), word_similarity(${q}, coalesce(${resources.title}, '')))`
  }

  const snippet = q
    ? sql<string | null>`ts_headline('simple', coalesce(${resources.title}, '') || ' ' || coalesce(${resources.description}, '') || ' ' || coalesce(${resources.notes}, '') || ' ' || coalesce(${resources.extractedText}, ''), ${tsq(q)}, ${HEADLINE_OPTS})`
    : sql<string | null>`null`

  const rows = await db
    .select({
      id: resources.id,
      title: resources.title,
      metadataTitle: sql<string | null>`${resources.metadata}->>'title'`,
      url: resources.url,
      type: resources.type,
      createdAt: resources.createdAt,
      snippet,
    })
    .from(resources)
    .where(and(...conditions))
    .orderBy(rank ? desc(rank) : desc(resources.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    entityType: "resource",
    title: r.title || r.metadataTitle || r.url || "Untitled",
    snippet: r.snippet,
    url: r.url,
    resourceType: r.type,
    color: null,
    createdAt: r.createdAt.toISOString(),
  }))
}

async function searchTasks(
  userId: string,
  query: SearchQuery,
  projectIds: string[] | undefined,
  limit: number
): Promise<SearchHit[]> {
  const q = query.q
  const conditions: SQL[] = [eq(tasks.userId, userId), sql`${tasks.deletedAt} is null`]
  if (query.tag) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskTags)
          .where(and(eq(taskTags.taskId, tasks.id), eq(taskTags.tagId, query.tag!)))
      )
    )
  }
  if (projectIds) {
    conditions.push(
      projectIds.length ? sql`${tasks.projectId} = any(${projectIds})` : sql`false`
    )
  }
  if (query.from) conditions.push(gte(tasks.createdAt, new Date(query.from)))
  if (query.to) conditions.push(lte(tasks.createdAt, new Date(query.to)))

  let rank: SQL | undefined
  if (q) {
    const query_ = tsq(q)
    conditions.push(
      sql`(${tasks.search} @@ ${query_} or word_similarity(${q}, ${tasks.title}) > 0.3)`
    )
    rank = sql`greatest(ts_rank(${tasks.search}, ${query_}), word_similarity(${q}, ${tasks.title}))`
  }

  const snippet = q
    ? sql<string | null>`ts_headline('simple', coalesce(${tasks.title}, '') || ' ' || coalesce(${tasks.descriptionText}, ''), ${tsq(q)}, ${HEADLINE_OPTS})`
    : sql<string | null>`null`

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      createdAt: tasks.createdAt,
      snippet,
    })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(rank ? desc(rank) : desc(tasks.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    entityType: "task",
    title: r.title,
    snippet: r.snippet,
    url: null,
    resourceType: null,
    color: null,
    createdAt: r.createdAt.toISOString(),
  }))
}

async function searchProjects(
  userId: string,
  query: SearchQuery,
  limit: number
): Promise<SearchHit[]> {
  const q = query.q
  const conditions: SQL[] = [eq(projects.userId, userId), sql`${projects.deletedAt} is null`]
  if (query.from) conditions.push(gte(projects.createdAt, new Date(query.from)))
  if (query.to) conditions.push(lte(projects.createdAt, new Date(query.to)))

  let rank: SQL | undefined
  if (q) {
    const query_ = tsq(q)
    conditions.push(
      sql`(${projects.search} @@ ${query_} or word_similarity(${q}, ${projects.name}) > 0.3)`
    )
    rank = sql`greatest(ts_rank(${projects.search}, ${query_}), word_similarity(${q}, ${projects.name}))`
  }

  const snippet = q
    ? sql<string | null>`ts_headline('simple', coalesce(${projects.name}, '') || ' ' || coalesce(${projects.description}, ''), ${tsq(q)}, ${HEADLINE_OPTS})`
    : sql<string | null>`null`

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      createdAt: projects.createdAt,
      snippet,
    })
    .from(projects)
    .where(and(...conditions))
    .orderBy(rank ? desc(rank) : desc(projects.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    entityType: "project",
    title: r.name,
    snippet: r.snippet,
    url: null,
    resourceType: null,
    color: r.color,
    createdAt: r.createdAt.toISOString(),
  }))
}

async function searchTagEntities(
  userId: string,
  query: SearchQuery,
  limit: number
): Promise<SearchHit[]> {
  const q = query.q
  const conditions: SQL[] = [eq(tags.userId, userId)]
  if (q)
    conditions.push(
      sql`(${tags.nameNormalized} ilike ${"%" + q.toLowerCase() + "%"} or word_similarity(${q}, ${tags.name}) > 0.3)`
    )

  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color, createdAt: tags.createdAt })
    .from(tags)
    .where(and(...conditions))
    .orderBy(q ? sql`word_similarity(${q}, ${tags.name}) desc` : desc(tags.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    entityType: "tag",
    title: r.name,
    snippet: null,
    url: null,
    resourceType: null,
    color: r.color,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Search across resources, tasks, projects and tags for one user. Results
 * are grouped by type; each group is ranked by full-text match, falling back
 * to trigram similarity on the title for fuzzy/typo-tolerant matches. */
export async function search(userId: string, query: SearchQuery): Promise<SearchResults> {
  const wantsAll = !query.type
  const limit = query.limit

  let projectIds: string[] | undefined
  if (query.project) {
    projectIds = query.includeDescendants
      ? (await getDescendantIds(userId, query.project)) ?? []
      : [query.project]
  }

  const [resourceHits, taskHits, projectHits, tagHits] = await Promise.all([
    wantsAll || query.type === "resource"
      ? searchResources(userId, query, projectIds, limit)
      : Promise.resolve([]),
    wantsAll || query.type === "task"
      ? searchTasks(userId, query, projectIds, limit)
      : Promise.resolve([]),
    wantsAll || query.type === "project"
      ? searchProjects(userId, query, limit)
      : Promise.resolve([]),
    wantsAll || query.type === "tag"
      ? searchTagEntities(userId, query, limit)
      : Promise.resolve([]),
  ])

  return { resources: resourceHits, tasks: taskHits, projects: projectHits, tags: tagHits }
}
