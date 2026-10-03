"use client"

import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { StarIcon } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"

import { formatDate } from "@/lib/format"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle, hostname } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

import { TagChips } from "./cards/card-parts"
import { ResourceImage } from "./embeds/resource-image"
import { TypeIcon } from "./type-icon"

/** Compact, virtualized list (window scrolling). */
export function ResourceList({
  items,
  onOpen,
}: {
  items: ResourceDto[]
  onOpen: (id: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const update = () =>
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 68,
    overscan: 8,
    scrollMargin,
  })

  return (
    <div
      ref={listRef}
      className="relative rounded-xl border border-border bg-card"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => {
        const r = items[row.index]!
        return (
          <button
            key={r.id}
            type="button"
            data-index={row.index}
            ref={virtualizer.measureElement}
            onClick={() => onOpen(r.id)}
            className={cn(
              "absolute inset-x-0 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:bg-brand-soft focus-visible:outline-none",
              row.index > 0 && "border-t border-border"
            )}
            style={{
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <ResourceImage
              src={r.thumbnailUrl}
              alt=""
              type={r.type}
              className="size-11 shrink-0 rounded-md"
              placeholderClassName="[&_svg]:size-4"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <TypeIcon type={r.type} />
                <span className="truncate text-sm font-medium">
                  {displayTitle(r)}
                </span>
                {r.isFavorite ? (
                  <StarIcon className="size-3.5 shrink-0 fill-brand text-brand" />
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-subtle">
                <span className="truncate">{hostname(r.url) ?? r.type}</span>
                <TagChips
                  tags={r.tags}
                  max={3}
                  className="hidden flex-nowrap sm:flex"
                />
              </div>
            </div>
            <span className="hidden shrink-0 text-xs text-subtle sm:block">
              {formatDate(r.createdAt)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
