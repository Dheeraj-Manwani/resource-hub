"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PanelRightOpenIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"

import { MetaLine, TagChips } from "./cards/card-parts"
import { ResourceFullView } from "./full-view/resource-full-view"
import { TypeBadge } from "./type-icon"

/** One resource at a time, large; ←/→ to move through the current list. */
export function FocusView({
  items,
  onOpen,
  onOpenImage,
  onNearEnd,
}: {
  items: ResourceDto[]
  onOpen: (id: string) => void
  onOpenImage: (id: string) => void
  onNearEnd: () => void
}) {
  const [index, setIndex] = useState(0)
  const safeIndex = Math.min(index, Math.max(items.length - 1, 0))
  const resource = items[safeIndex]

  useEffect(() => {
    if (safeIndex >= items.length - 3) onNearEnd()
  }, [safeIndex, items.length, onNearEnd])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.closest("input,textarea,[contenteditable=true]")) return
      if (e.key === "ArrowRight" || e.key === "j")
        setIndex((i) => Math.min(i + 1, items.length - 1))
      if (e.key === "ArrowLeft" || e.key === "k")
        setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [items.length])

  if (!resource) return null
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIndex(safeIndex - 1)}
          disabled={safeIndex === 0}
        >
          <ChevronLeftIcon />
          Prev
        </Button>
        <span className="text-xs text-subtle tabular-nums">
          {safeIndex + 1} / {items.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIndex(safeIndex + 1)}
          disabled={safeIndex >= items.length - 1}
        >
          Next
          <ChevronRightIcon />
        </Button>
      </div>
      <article
        key={resource.id}
        className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <TypeBadge type={resource.type} />
            <h2 className="text-xl font-semibold tracking-tight">
              {displayTitle(resource)}
            </h2>
            <MetaLine resource={resource} />
          </div>
          <Button size="sm" variant="ghost" onClick={() => onOpen(resource.id)}>
            <PanelRightOpenIcon />
            Details
          </Button>
        </div>
        <ResourceFullView resource={resource} onOpenImage={onOpenImage} />
        {resource.notes ? (
          <p className="text-sm whitespace-pre-line text-text-muted">
            {resource.notes}
          </p>
        ) : null}
        <TagChips tags={resource.tags} max={12} />
      </article>
      <p className="mt-3 text-center text-xs text-subtle">
        Use ← and → to move between resources.
      </p>
    </div>
  )
}
