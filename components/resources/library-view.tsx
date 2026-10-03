"use client"

import {
  CheckSquareIcon,
  GalleryVerticalIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  FileExclamationPoint,
  ListChecksIcon,
  StarIcon,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { BulkActionBar } from "@/components/resources/bulk-action-bar"
import { useShell } from "@/components/shell/shell-context"
import { CardGridSkeleton, ListSkeleton } from "@/components/skeletons"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  useLoadDemoData,
  useResourceList,
  useTagSearch,
  type ResourceFilters,
} from "@/hooks/queries/resources"
import { useSettings, useUpdateSettings } from "@/hooks/queries/settings"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { useInView } from "@/hooks/use-in-view"
import type { SettingsDto } from "@/lib/server/dal/settings"
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type ResourceType,
} from "@/lib/resources/types"
import { cn } from "@/lib/utils"

import { FocusView } from "./focus-view"
import { useLightbox } from "./lightbox/lightbox-provider"
import { Masonry } from "./masonry"
import { ResourceCard } from "./resource-card"
import { ResourceList } from "./resource-list"
import { TypeIcon } from "./type-icon"

type View = SettingsDto["libraryView"]
type SortKey = "newest" | "oldest" | "updated" | "title"

const SORTS: Record<
  SortKey,
  {
    label: string
    sort: ResourceFilters["sort"]
    order: ResourceFilters["order"]
  }
> = {
  newest: { label: "Newest first", sort: "created", order: "desc" },
  oldest: { label: "Oldest first", sort: "created", order: "asc" },
  updated: { label: "Recently updated", sort: "updated", order: "desc" },
  title: { label: "Title A–Z", sort: "title", order: "asc" },
}

const VIEWS: { value: View; label: string; icon: LucideIcon }[] = [
  { value: "grid", label: "Grid", icon: LayoutGridIcon },
  { value: "list", label: "List", icon: ListIcon },
  { value: "focus", label: "Focus", icon: GalleryVerticalIcon },
]

const ALL = "__all"

function FilterBar({
  type,
  setType,
  tag,
  setTag,
  favorite,
  setFavorite,
  hasTasks,
  setHasTasks,
  reviewed,
  setReviewed,
  sort,
  setSort,
  view,
  setView,
  selectMode,
  onToggleSelectMode,
}: {
  type: ResourceType | undefined
  setType: (t: ResourceType | undefined) => void
  tag: string | undefined
  setTag: (t: string | undefined) => void
  favorite: boolean
  setFavorite: (v: boolean) => void
  hasTasks: boolean
  setHasTasks: (v: boolean) => void
  reviewed: "all" | "reviewed" | "unreviewed"
  setReviewed: (v: "all" | "reviewed" | "unreviewed") => void
  sort: SortKey
  setSort: (s: SortKey) => void
  view: View
  setView: (v: View) => void
  selectMode: boolean
  onToggleSelectMode: () => void
}) {
  const { data: tags = [] } = useTagSearch("")
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Select
        value={type ?? ALL}
        onValueChange={(v) =>
          setType(v === ALL ? undefined : (v as ResourceType))
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="Filter by type"
          className="min-w-32"
        >
          <SelectValue>
            {(v: string) =>
              v === ALL ? (
                "All types"
              ) : (
                <span className="flex items-center gap-1.5">
                  <TypeIcon type={v as ResourceType} />
                  {RESOURCE_TYPE_LABELS[v as ResourceType]}
                </span>
              )
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

      <Select
        value={tag ?? ALL}
        onValueChange={(v) => setTag(v === ALL ? undefined : (v as string))}
      >
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

      <Select
        value={reviewed}
        onValueChange={(v) => setReviewed(v as typeof reviewed)}
      >
        <SelectTrigger size="sm" aria-label="Reviewed filter">
          <SelectValue>
            {(v: string) =>
              ({
                all: "Any status",
                reviewed: "Reviewed",
                unreviewed: "Not reviewed",
              })[v as typeof reviewed]
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          <SelectItem value="reviewed">Reviewed</SelectItem>
          <SelectItem value="unreviewed">Not reviewed</SelectItem>
        </SelectContent>
      </Select>

      <Button
        size="sm"
        variant={favorite ? "default" : "outline"}
        aria-pressed={favorite}
        onClick={() => setFavorite(!favorite)}
      >
        <StarIcon className={cn(favorite && "fill-brand-fg")} />
        Favorites
      </Button>

      <Button
        size="sm"
        variant={hasTasks ? "default" : "outline"}
        aria-pressed={hasTasks}
        onClick={() => setHasTasks(!hasTasks)}
      >
        <ListChecksIcon />
        Has tasks
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant={selectMode ? "default" : "outline"}
          aria-pressed={selectMode}
          onClick={onToggleSelectMode}
        >
          <CheckSquareIcon />
          Select
        </Button>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger size="sm" aria-label="Sort">
            <SelectValue>
              {(v: string) => SORTS[v as SortKey].label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORTS[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          value={[view]}
          onValueChange={(values: string[]) => {
            const next = values[0] as View | undefined
            if (next) setView(next)
          }}
          variant="outline"
          size="sm"
          aria-label="View"
        >
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              title={label}
            >
              <Icon />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}

export function LibraryView({
  title,
  description,
  initialSettings,
  baseFilters,
  emptyTitle,
  emptyDescription,
  headerActions,
  hideHeader,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  initialSettings: SettingsDto
  baseFilters?: ResourceFilters
  emptyTitle: string
  emptyDescription: string
  headerActions?: React.ReactNode
  /** Skip the built-in title/description header (a custom one is rendered above). */
  hideHeader?: boolean
}) {
  const { openAddResource } = useShell()
  const { openResource } = useDetailDrawer()
  const { openImages } = useLightbox()
  const loadDemo = useLoadDemoData()
  const { data: settings } = useSettings(initialSettings)
  const updateSettings = useUpdateSettings()
  const view = settings?.libraryView ?? initialSettings.libraryView

  const [type, setType] = useState<ResourceType | undefined>()
  const [tag, setTag] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const [hasTasks, setHasTasks] = useState(false)
  const [reviewed, setReviewed] = useState<"all" | "reviewed" | "unreviewed">(
    "all"
  )
  const [sort, setSort] = useState<SortKey>("newest")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filters: ResourceFilters = useMemo(
    () => ({
      ...baseFilters,
      type,
      tag,
      favorite: favorite || undefined,
      hasTasks: hasTasks || undefined,
      reviewed: reviewed === "all" ? undefined : reviewed === "reviewed",
      sort: SORTS[sort].sort,
      order: SORTS[sort].order,
    }),
    [baseFilters, type, tag, favorite, hasTasks, reviewed, sort]
  )
  const query = useResourceList(filters)
  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  )
  const filtered = type || tag || favorite || hasTasks || reviewed !== "all"

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])
  const { ref: sentinelRef, inView: nearEnd } = useInView<HTMLDivElement>({
    rootMargin: "1200px",
  })
  // Re-checks after every page so a short page keeps loading until the
  // sentinel leaves the viewport.
  useEffect(() => {
    if (nearEnd && view !== "focus") loadMore()
  }, [nearEnd, items.length, view, loadMore])

  const openImage = useCallback(
    (id: string) => openImages(items, id),
    [items, openImages]
  )
  const toggleSelected = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    []
  )
  const renderCard = useCallback(
    (r: (typeof items)[number]) => (
      <ResourceCard
        resource={r}
        onOpen={openResource}
        onOpenImage={openImage}
        selectable={selectMode}
        selected={selected.has(r.id)}
        onToggleSelect={toggleSelected}
      />
    ),
    [openResource, openImage, selectMode, selected, toggleSelected]
  )

  // Cmd/Ctrl+A selects every currently-loaded item while in select mode.
  useEffect(() => {
    if (!selectMode) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault()
        setSelected(new Set(items.map((r) => r.id)))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectMode, items])

  let body: React.ReactNode
  if (query.isPending) {
    body = view === "list" ? <ListSkeleton /> : <CardGridSkeleton />
  } else if (query.isError) {
    body = (
      <EmptyState
        icon={FileExclamationPoint}
        title="Couldn't load resources"
        description={query.error.message}
      >
        <Button onClick={() => query.refetch()}>Try again</Button>
      </EmptyState>
    )
  } else if (!items.length) {
    body = filtered ? (
      <EmptyState
        icon={FileExclamationPoint}
        title="Nothing matches these filters"
        description="Try removing a filter."
      >
        <Button
          variant="outline"
          onClick={() => {
            setType(undefined)
            setTag(undefined)
            setFavorite(false)
            setHasTasks(false)
            setReviewed("all")
          }}
        >
          Clear filters
        </Button>
      </EmptyState>
    ) : (
      <EmptyState
        icon={FileExclamationPoint}
        title={emptyTitle}
        description={emptyDescription}
      >
        <Button onClick={() => openAddResource()}>
          <PlusIcon />
          Add resource
        </Button>
        <Button
          variant="outline"
          onClick={() => loadDemo.mutate()}
          disabled={loadDemo.isPending}
        >
          {loadDemo.isPending ? <Loader2Icon className="animate-spin" /> : null}
          Load demo data
        </Button>
      </EmptyState>
    )
  } else if (view === "list") {
    body = <ResourceList items={items} onOpen={openResource} />
  } else if (view === "focus") {
    body = (
      <FocusView
        items={items}
        onOpen={openResource}
        onOpenImage={openImage}
        onNearEnd={loadMore}
      />
    )
  } else {
    body = (
      <Masonry items={items} getKey={(r) => r.id} renderItem={renderCard} />
    )
  }

  return (
    <>
      {hideHeader ? null : (
        <PageHeader
          title={title}
          description={description}
          actions={headerActions}
        />
      )}
      <FilterBar
        type={type}
        setType={setType}
        tag={tag}
        setTag={setTag}
        favorite={favorite}
        setFavorite={setFavorite}
        hasTasks={hasTasks}
        setHasTasks={setHasTasks}
        reviewed={reviewed}
        setReviewed={setReviewed}
        sort={sort}
        setSort={setSort}
        view={view}
        setView={(v) => updateSettings.mutate({ libraryView: v })}
        selectMode={selectMode}
        onToggleSelectMode={() => {
          setSelectMode((v) => !v)
          setSelected(new Set())
        }}
      />
      {body}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {isFetchingNextPage ? (
        <div className="flex justify-center py-6 text-subtle">
          <Loader2Icon className="size-5 animate-spin" />
        </div>
      ) : null}
      {selectMode ? (
        <BulkActionBar
          selectedIds={[...selected]}
          currentProjectId={baseFilters?.projectId}
          onClear={() => setSelected(new Set())}
        />
      ) : null}
    </>
  )
}
