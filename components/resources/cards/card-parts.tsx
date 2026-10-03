"use client"

import { Loader2Icon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"

import { useRefreshMetadata } from "@/hooks/queries/resources"
import { formatDate } from "@/lib/format"
import type { ResourceDto, TagDto } from "@/lib/resources/dto"
import { displayTitle, hostname } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

import { TypeIcon } from "../type-icon"

export function Favicon({
  src,
  type,
}: {
  src?: string
  type: ResourceDto["type"]
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <TypeIcon type={type} />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-3.5 shrink-0 rounded-sm"
    />
  )
}

/** Source line: icon · site/author · date. */
export function MetaLine({
  resource,
  className,
}: {
  resource: ResourceDto
  className?: string
}) {
  const m = resource.metadata
  const source =
    resource.type === "youtube"
      ? (m.youtube?.channel ?? m.author)
      : resource.type === "x"
        ? (m.author ?? (m.x?.handle ? `@${m.x.handle}` : null))
        : ((m.siteName && m.siteName !== hostname(resource.url)
            ? m.siteName
            : null) ?? hostname(resource.url))
  const date = m.publishedAt ?? resource.createdAt
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs text-subtle",
        className
      )}
    >
      <Favicon
        src={resource.type === "link" ? m.favicon : undefined}
        type={resource.type}
      />
      {source ? <span className="truncate">{source}</span> : null}
      {source ? <span aria-hidden>·</span> : null}
      <span className="shrink-0">{formatDate(date)}</span>
    </div>
  )
}

export function TagChips({
  tags,
  max = 4,
  className,
}: {
  tags: TagDto[]
  max?: number
  className?: string
}) {
  if (!tags.length) return null
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.slice(0, max).map((t) => (
        <span
          key={t.id}
          className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-text-muted"
        >
          #{t.name}
        </span>
      ))}
      {tags.length > max ? (
        <span className="px-1 text-[11px] text-subtle">
          +{tags.length - max}
        </span>
      ) : null}
    </div>
  )
}

export function MetadataStatusNote({ resource }: { resource: ResourceDto }) {
  const refresh = useRefreshMetadata()
  if (resource.metadataStatus === "pending") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-subtle">
        <Loader2Icon className="size-3 animate-spin" />
        Fetching details…
      </p>
    )
  }
  if (resource.metadataStatus === "failed") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-amber-400/90">
        <TriangleAlertIcon className="size-3" />
        Couldn&apos;t fetch details
        <button
          type="button"
          onClick={() => refresh.mutate(resource.id)}
          className="ml-1 inline-flex items-center gap-1 rounded text-text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          <RefreshCwIcon className="size-3" />
          Retry
        </button>
      </p>
    )
  }
  return null
}

export function CardText({
  resource,
  showDescription = true,
  clamp = 3,
}: {
  resource: ResourceDto
  showDescription?: boolean
  clamp?: number
}) {
  const title = displayTitle(resource)
  const description = resource.metadata.description
  return (
    <div className="space-y-1.5 p-3">
      <MetaLine resource={resource} />
      <h3 className="line-clamp-2 text-[15px] leading-snug font-medium text-foreground">
        {title}
      </h3>
      {showDescription && description && description !== title ? (
        <p
          className={cn(
            "text-sm text-text-muted",
            clamp === 2 ? "line-clamp-2" : "line-clamp-3"
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}
