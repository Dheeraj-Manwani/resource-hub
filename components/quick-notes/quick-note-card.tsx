"use client"

import { Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"
import { cn } from "@/lib/utils"

export function QuickNoteCard({
  note,
  onOpen,
  onDelete,
}: {
  note: QuickNoteDto
  onOpen: () => void
  onDelete: () => void
}) {
  const preview = note.bodyText?.trim()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen()
      }}
      className="group relative flex h-40 flex-col rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-brand"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete note"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute top-2 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon />
      </Button>

      <h3
        className={cn(
          "truncate pr-7 text-sm font-medium",
          !note.title && "text-subtle"
        )}
      >
        {note.title || "Untitled"}
      </h3>

      <p className="mt-1.5 flex-1 overflow-hidden text-sm whitespace-pre-line text-text-muted">
        {preview || <span className="text-subtle italic">Empty note</span>}
      </p>

      <span className="mt-2 text-xs text-subtle">
        {formatRelative(note.updatedAt)}
      </span>
    </div>
  )
}
