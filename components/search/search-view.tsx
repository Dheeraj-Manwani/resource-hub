"use client"

import { QueryFeedback } from "@/components/query-feedback"

import {
  FolderIcon,
  ListTodoIcon,
  SearchIcon,
  StarIcon,
  TagIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"

import { CreationActions } from "@/components/shell/creation-actions"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { TypeIcon } from "@/components/resources/type-icon"
import { useTagSearch } from "@/hooks/queries/resources"
import { useSearch } from "@/hooks/queries/search"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import {
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
} from "@/lib/resources/types"
import { formatDate } from "@/lib/format"
import type { SearchHit } from "@/lib/server/dal/search"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { Snippet } from "./snippet"

const ALL = "__all__"

const ENTITY_SECTIONS = [
  { key: "resources" as const, label: "Resources", icon: FolderIcon },
  { key: "tasks" as const, label: "Tasks", icon: ListTodoIcon },
  { key: "projects" as const, label: "Projects", icon: FolderIcon },
  { key: "tags" as const, label: "Tags", icon: TagIcon },
]

export function SearchView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { openResource, openTask } = useDetailDrawer()

  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const [type, setType] = useState<string>(ALL)
  const [resourceType, setResourceType] = useState<string>(ALL)
  const [tag, setTag] = useState<string>(ALL)
  const [favorite, setFavorite] = useState(false)
  const [linked, setLinked] = useState(false)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const { data: tags = [] } = useTagSearch("")

  const query = useMemo(
    () => ({
      q: q.trim() || undefined,
      type:
        type === ALL
          ? undefined
          : (type as "resource" | "task" | "project" | "tag"),
      resourceType:
        resourceType === ALL ? undefined : (resourceType as ResourceType),
      tag: tag === ALL ? undefined : tag,
      favorite: favorite || undefined,
      linked: linked || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      limit: 30,
    }),
    [q, type, resourceType, tag, favorite, linked, from, to]
  )

  const search = useSearch(query)
  const { data, isFetching } = search
  const enabled = search.isEnabled
  const total = data
    ? data.resources.length +
      data.tasks.length +
      data.projects.length +
      data.tags.length
    : 0

  function onSelect(hit: SearchHit) {
    if (hit.entityType === "resource") openResource(hit.id)
    else if (hit.entityType === "task") openTask(hit.id)
    else if (hit.entityType === "project") router.push(`/projects/${hit.id}`)
    else router.push("/tags")
  }

  return (
    <>
      <PageHeader
        title="Search"
        actions={<CreationActions />}
        description="Across resources, tasks, projects and tags, with full-text and fuzzy matching."
      />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <SearchIcon className="size-4 shrink-0 text-subtle" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything…"
          className="h-11 border-0 px-3.5 shadow-none focus-visible:ring-0"
          autoFocus
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(v) => setType(v ?? ALL)}>
          <SelectTrigger
            size="sm"
            aria-label="Filter by entity type"
            className="min-w-28"
          >
            <SelectValue>
              {(v: string) =>
                v === ALL
                  ? "Everything"
                  : {
                      resource: "Resources",
                      task: "Tasks",
                      project: "Projects",
                      tag: "Tags",
                    }[v]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everything</SelectItem>
            <SelectItem value="resource">Resources</SelectItem>
            <SelectItem value="task">Tasks</SelectItem>
            <SelectItem value="project">Projects</SelectItem>
            <SelectItem value="tag">Tags</SelectItem>
          </SelectContent>
        </Select>

        {type === "resource" || type === ALL ? (
          <Select
            value={resourceType}
            onValueChange={(v) => setResourceType(v ?? ALL)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Filter by resource type"
              className="min-w-32"
            >
              <SelectValue>
                {(v: string) =>
                  v === ALL
                    ? "All types"
                    : RESOURCE_TYPE_LABELS[
                        v as keyof typeof RESOURCE_TYPE_LABELS
                      ]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {RESOURCE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  <TypeIcon type={t} />
                  {RESOURCE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={tag} onValueChange={(v) => setTag(v ?? ALL)}>
          <SelectTrigger
            size="sm"
            aria-label="Filter by tag"
            className="min-w-28"
          >
            <SelectValue>
              {(v: string) =>
                v === ALL
                  ? "All tags"
                  : `#${tags.find((t) => t.id === v)?.name ?? "tag"}`
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tags</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                #{t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup
          value={[
            ...(favorite ? ["favorite"] : []),
            ...(linked ? ["linked"] : []),
          ]}
          onValueChange={(values: string[]) => {
            setFavorite(values.includes("favorite"))
            setLinked(values.includes("linked"))
          }}
          size="sm"
        >
          <ToggleGroupItem value="favorite" aria-label="Favorites only">
            <StarIcon className={favorite ? "fill-current" : undefined} />
            Favorites
          </ToggleGroupItem>
          <ToggleGroupItem value="linked" aria-label="Has linked tasks">
            <ListTodoIcon />
            Has tasks
          </ToggleGroupItem>
        </ToggleGroup>

        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
          className="h-8 w-36 text-xs"
        />
        <span className="text-xs text-subtle">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
          className="h-8 w-36 text-xs"
        />
      </div>

      {enabled ? <QueryFeedback query={search} label="search results" /> : null}
      {search.isError && !data ? null : !enabled ? (
        <EmptyState
          icon={SearchIcon}
          title="Search your whole library"
          description="Type a query or set a filter above. Matches on title, notes, description and extracted text are highlighted; typos are tolerated."
        />
      ) : total === 0 && search.isSuccess && !isFetching ? (
        <EmptyState
          icon={SearchIcon}
          title="Nothing found"
          description="Try a different query or loosen a filter."
        />
      ) : (
        <div className="space-y-8">
          {ENTITY_SECTIONS.map(({ key, label, icon: Icon }) => {
            const hits = data?.[key] ?? []
            if (!hits.length) return null
            return (
              <section key={key}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-text-muted">
                  <Icon className="size-4" />
                  {label}
                  <span className="text-subtle">({hits.length})</span>
                </h2>
                <ul className="space-y-1">
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(hit)}
                        className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-white/[0.04]"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          {hit.entityType === "resource" && hit.resourceType ? (
                            <TypeIcon type={hit.resourceType} />
                          ) : null}
                          <span className="truncate font-medium">
                            {hit.title}
                          </span>
                          <span className="shrink-0 text-xs text-subtle">
                            {formatDate(hit.createdAt)}
                          </span>
                        </span>
                        {hit.snippet ? (
                          <span className="line-clamp-1 text-xs text-text-muted">
                            <Snippet text={hit.snippet} />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
