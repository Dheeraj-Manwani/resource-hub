"use client"

import {
  CheckCircle2Icon,
  CircleIcon,
  ExternalLinkIcon,
  FolderIcon,
  ImageUpIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { toast } from "react-hot-toast"

import { EmptyState } from "@/components/empty-state"
import { ProjectSinglePicker } from "@/components/projects/project-picker"
import { StatusIcon } from "@/components/tasks/task-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useLinkResources, useUnlinkResources } from "@/hooks/queries/projects"
import {
  upsertResourceInCache,
  useDeleteResource,
  useRefreshMetadata,
  useResource,
  useUpdateResource,
} from "@/hooks/queries/resources"
import {
  useLinkTaskResources,
  useResourceTasks,
  useTaskList,
  useUnlinkTaskResources,
} from "@/hooks/queries/tasks"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { uploadFile } from "@/hooks/use-uploads"
import { useQueryClient } from "@tanstack/react-query"
import { formatDate, formatRelative } from "@/lib/format"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type ResourceType,
} from "@/lib/resources/types"
import type { UpdateResourceInput } from "@/lib/validation/resources"
import { cn } from "@/lib/utils"

import { ResourceFullView } from "./full-view/resource-full-view"
import { useLightbox } from "./lightbox/lightbox-provider"
import { TagInput } from "./tag-input"
import { TypeBadge, TypeIcon } from "./type-icon"

const URL_TYPES: ResourceType[] = [
  "youtube",
  "instagram",
  "x",
  "github",
  "pinterest",
  "link",
]

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium tracking-wide text-subtle uppercase"
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

/**
 * Text input with explicit Save/Cancel controls — nothing is written until
 * Save is pressed (or Enter, for single-line fields), unlike the instant
 * writes used for links/tags/projects elsewhere in this panel.
 */
function InlineText({
  id,
  value,
  placeholder,
  multiline,
  onSave,
  className,
}: {
  id?: string
  value: string
  placeholder?: string
  multiline?: boolean
  onSave: (value: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(value)
  }
  const dirty = draft !== value
  const save = () => {
    if (dirty) onSave(draft)
  }
  const cancel = () => setDraft(value)
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      cancel()
      ;(e.target as HTMLElement).blur()
    }
    if (!multiline && e.key === "Enter") {
      save()
      ;(e.target as HTMLElement).blur()
    }
  }

  return (
    <div className="space-y-1.5">
      {multiline ? (
        <Textarea
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          className={className}
        />
      ) : (
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className={className}
        />
      )}
      {dirty ? (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-5 pt-14">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="aspect-video w-full rounded-lg" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

function CustomThumbnailButton({ resource }: { resource: ResourceDto }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file) return
          setBusy(true)
          try {
            const updated = await uploadFile(file, {
              purpose: "thumbnail",
              resourceId: resource.id,
            })
            upsertResourceInCache(qc, updated)
            toast.success("Thumbnail updated")
          } catch (error) {
            toast.error((error as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <ImageUpIcon />}
        Upload thumbnail
      </Button>
    </>
  )
}

function ProjectsField({ resource }: { resource: ResourceDto }) {
  const link = useLinkResources()
  const unlink = useUnlinkResources()
  const linkedIds = new Set(resource.projects.map((p) => p.id))

  return (
    <Field label="Projects">
      <div className="flex flex-wrap items-center gap-1.5">
        {resource.projects.map((p) => (
          <span
            key={p.id}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-white/[0.06] pr-1 pl-2 text-xs"
          >
            <Link
              href={`/projects/${p.id}`}
              className="flex items-center gap-1 hover:underline"
            >
              <FolderIcon
                className="size-3"
                style={{ color: p.color ?? undefined }}
              />
              {p.name}
            </Link>
            <button
              type="button"
              aria-label={`Remove from ${p.name}`}
              onClick={() =>
                unlink.mutate({ projectId: p.id, resourceIds: [resource.id] })
              }
              className="rounded-full p-0.5 text-text-muted hover:bg-white/10 hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <ProjectSinglePicker
          value={null}
          excludeIds={linkedIds}
          onChange={(id) => {
            if (id) link.mutate({ projectId: id, resourceIds: [resource.id] })
          }}
          render={
            <button
              type="button"
              aria-label="Add to project"
              className="flex h-6 items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-xs text-subtle hover:border-brand/50 hover:text-brand"
            />
          }
        >
          <PlusIcon className="size-3" />
          Add
        </ProjectSinglePicker>
      </div>
    </Field>
  )
}

/** Searchable popover to pick an existing task to link (title filter
 * client-side, same convention as `ProjectSinglePicker`'s project search —
 * full-text search across all tasks arrives in Phase 6). */
function LinkTaskPicker({ resourceId, excludeIds }: { resourceId: string; excludeIds: Set<string> }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const { data } = useTaskList({})
  const link = useLinkTaskResources()
  const items = useMemo(
    () => (data?.pages.flatMap((p) => p.items) ?? []).filter((t) => !excludeIds.has(t.id)),
    [data, excludeIds]
  )
  const filtered = query.trim()
    ? items.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Link task"
            className="flex h-6 items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-xs text-subtle hover:border-brand/50 hover:text-brand"
          />
        }
      >
        <PlusIcon className="size-3" />
        Link task
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a task…"
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
          {filtered.length ? (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  link.mutate({ taskId: t.id, resourceIds: [resourceId] })
                  setOpen(false)
                  setQuery("")
                }}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-white/[0.06]"
              >
                <StatusIcon status={t.status} className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-center text-xs text-subtle">No matching tasks</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TasksField({ resource }: { resource: ResourceDto }) {
  const { data: tasks = [] } = useResourceTasks(resource.id)
  const unlink = useUnlinkTaskResources()
  const { openTask } = useDetailDrawer()
  const linkedIds = new Set(tasks.map((t) => t.id))

  return (
    <Field label="Tasks">
      <div className="flex flex-wrap items-center gap-1.5">
        {tasks.map((t) => (
          <span
            key={t.id}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-white/[0.06] pr-1 pl-2 text-xs"
          >
            <button
              type="button"
              onClick={() => openTask(t.id)}
              className="flex items-center gap-1 hover:underline"
            >
              <StatusIcon status={t.status} className="size-3" />
              {t.title}
            </button>
            <button
              type="button"
              aria-label={`Unlink ${t.title}`}
              onClick={() => unlink.mutate({ taskId: t.id, resourceIds: [resource.id] })}
              className="rounded-full p-0.5 text-text-muted hover:bg-white/10 hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <LinkTaskPicker resourceId={resource.id} excludeIds={linkedIds} />
      </div>
    </Field>
  )
}

function DetailContent({ resource }: { resource: ResourceDto }) {
  const update = useUpdateResource()
  const remove = useDeleteResource()
  const refresh = useRefreshMetadata()
  const { close } = useDetailDrawer()
  const { openImages } = useLightbox()
  const save = (patch: UpdateResourceInput) =>
    update.mutate({ id: resource.id, patch })
  const override = resource.metadataOverride ?? {}
  const saveOverride = (
    key: "description" | "image" | "author",
    value: string
  ) => {
    const next = { ...override, [key]: value.trim() || undefined }
    save({ metadataOverride: Object.values(next).some(Boolean) ? next : null })
  }
  const canRefresh = !!resource.url && URL_TYPES.includes(resource.type)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-4 py-2.5 pr-12">
        <TypeBadge type={resource.type} />
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={
                    resource.isFavorite
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                  aria-pressed={resource.isFavorite}
                  onClick={() => save({ isFavorite: !resource.isFavorite })}
                />
              }
            >
              <StarIcon
                className={cn(resource.isFavorite && "fill-brand text-brand")}
              />
            </TooltipTrigger>
            <TooltipContent>Favorite</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={
                    resource.isReviewed
                      ? "Mark as not reviewed"
                      : "Mark as reviewed"
                  }
                  aria-pressed={resource.isReviewed}
                  onClick={() => save({ isReviewed: !resource.isReviewed })}
                />
              }
            >
              {resource.isReviewed ? (
                <CheckCircle2Icon className="text-emerald-400" />
              ) : (
                <CircleIcon />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {resource.isReviewed ? "Reviewed" : "Mark reviewed"}
            </TooltipContent>
          </Tooltip>
          {canRefresh ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Refresh metadata"
                    disabled={resource.metadataStatus === "pending"}
                    onClick={() => refresh.mutate(resource.id)}
                  />
                }
              >
                <RefreshCwIcon
                  className={cn(
                    resource.metadataStatus === "pending" && "animate-spin"
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>Refresh metadata</TooltipContent>
            </Tooltip>
          ) : null}
          {resource.url ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Open original"
                    nativeButton={false}
                    render={
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  />
                }
              >
                <ExternalLinkIcon />
              </TooltipTrigger>
              <TooltipContent>Open original</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Delete"
                  className="hover:text-destructive"
                  onClick={() => {
                    remove.mutate(resource.id)
                    close()
                  }}
                />
              }
            >
              <Trash2Icon />
            </TooltipTrigger>
            <TooltipContent>Move to trash</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <div className="space-y-1">
          <SheetTitle className="sr-only">{displayTitle(resource)}</SheetTitle>
          <SheetDescription className="sr-only">
            Resource details
          </SheetDescription>
          <InlineText
            value={resource.title ?? ""}
            placeholder={displayTitle(resource)}
            onSave={(title) => save({ title: title || null })}
            className="h-auto border-transparent bg-transparent px-0 text-lg font-semibold shadow-none hover:border-border focus-visible:border-border-strong focus-visible:px-2 md:text-lg dark:bg-transparent"
          />
          {resource.metadataStatus === "failed" ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-400">
              <TriangleAlertIcon className="size-3.5" />
              Couldn&apos;t fetch details
              {resource.metadata.error ? `: ${resource.metadata.error}` : ""}
            </p>
          ) : resource.metadataStatus === "pending" ? (
            <p className="flex items-center gap-1.5 text-xs text-subtle">
              <Loader2Icon className="size-3.5 animate-spin" /> Fetching
              details…
            </p>
          ) : null}
        </div>

        <ResourceFullView
          resource={resource}
          onOpenImage={(id) => openImages([resource], id)}
        />

        <Field label="Notes" htmlFor="resource-notes">
          <InlineText
            id="resource-notes"
            multiline
            value={resource.notes ?? ""}
            placeholder="Why did you save this?"
            onSave={(notes) => save({ notes: notes || null })}
          />
        </Field>

        <Field label="Tags">
          <TagInput
            value={resource.tags.map((t) => t.name)}
            onChange={(tags) => save({ tags })}
          />
        </Field>

        <ProjectsField resource={resource} />

        <TasksField resource={resource} />

        {resource.url ? (
          <Field label="Type">
            <Select
              value={resource.type}
              onValueChange={(v) => save({ type: v as ResourceType })}
            >
              <SelectTrigger className="w-48" aria-label="Type">
                <SelectValue>
                  {(v: string) => (
                    <span className="flex items-center gap-1.5">
                      <TypeIcon type={v as ResourceType} />
                      {RESOURCE_TYPE_LABELS[v as ResourceType]}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPES.filter(
                  (t) => URL_TYPES.includes(t) || t === resource.type
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    <TypeIcon type={t} />
                    {RESOURCE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {resource.url ? (
          <details className="group rounded-lg border border-border">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium select-none marker:hidden">
              Override metadata
              <span className="ml-2 text-xs font-normal text-subtle">
                for when a platform gives us too little
              </span>
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              <Field label="Description" htmlFor="ov-description">
                <InlineText
                  id="ov-description"
                  multiline
                  value={override.description ?? ""}
                  placeholder={resource.metadata.description ?? "Description"}
                  onSave={(v) => saveOverride("description", v)}
                />
              </Field>
              <Field label="Author" htmlFor="ov-author">
                <InlineText
                  id="ov-author"
                  value={override.author ?? ""}
                  placeholder={resource.metadata.author ?? "Author"}
                  onSave={(v) => saveOverride("author", v)}
                />
              </Field>
              <Field label="Image URL" htmlFor="ov-image">
                <InlineText
                  id="ov-image"
                  value={override.image ?? ""}
                  placeholder="https://…"
                  onSave={(v) => saveOverride("image", v)}
                />
              </Field>
              <CustomThumbnailButton resource={resource} />
            </div>
          </details>
        ) : null}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border pt-4 text-xs">
          <dt className="text-subtle">Added</dt>
          <dd className="text-text-muted">{formatDate(resource.createdAt)}</dd>
          <dt className="text-subtle">Updated</dt>
          <dd className="text-text-muted">
            {formatRelative(resource.updatedAt)}
          </dd>
          {resource.metadataFetchedAt ? (
            <>
              <dt className="text-subtle">Snapshot</dt>
              <dd className="text-text-muted">
                {formatRelative(resource.metadataFetchedAt)}
              </dd>
            </>
          ) : null}
          {resource.url ? (
            <>
              <dt className="text-subtle">URL</dt>
              <dd className="truncate text-text-muted">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand hover:underline"
                >
                  {resource.url}
                </a>
              </dd>
            </>
          ) : null}
        </dl>
      </div>
    </div>
  )
}

export function ResourceDetail({ id }: { id: string }) {
  const { data, isPending, isError } = useResource(id)
  if (isPending && !data) return <DetailSkeleton />
  if (isError || !data) {
    return (
      <div className="p-6 pt-14">
        <SheetTitle className="sr-only">Not found</SheetTitle>
        <EmptyState
          icon={TriangleAlertIcon}
          title="Resource not found"
          description="It may have been deleted."
        />
      </div>
    )
  }
  return <DetailContent resource={data} />
}
