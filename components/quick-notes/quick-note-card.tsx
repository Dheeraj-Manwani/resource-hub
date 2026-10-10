"use client"

import {
  FolderIcon,
  Trash2Icon,
  FileTextIcon,
  SheetIcon,
  PencilRulerIcon,
  PencilIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"
import { cn } from "@/lib/utils"
import { ItemMenu } from "@/components/ui/item-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export function QuickNoteCard({
  note,
  onOpen,
  onDelete,
  hideProject,
}: {
  note: QuickNoteDto
  onOpen: () => void
  onDelete: () => void
  /** Suppress the project badge when every card in the list already belongs
   * to the same project (the project page's Notes tab). */
  hideProject?: boolean
}) {
  const preview = note.bodyText?.trim()
  return (
    <ItemMenu
      label={`${note.title || "Untitled"} options`}
      buttonClassName="absolute top-2 right-2"
      actions={
        <>
          <DropdownMenuItem onClick={onOpen}>
            <PencilIcon />
            Open / edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon />
            Move doc to Trash
          </DropdownMenuItem>
        </>
      }
      trigger={
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target === e.currentTarget) onOpen()
          }}
          className="group relative flex h-40 flex-col rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-brand"
        />
      }
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Move doc to Trash"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute top-2 right-10 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon />
      </Button>

      <h3
        className={cn(
          "truncate pr-16 text-sm font-medium",
          !note.title && "text-subtle"
        )}
      >
        {note.kind === "spreadsheet" ? (
          <SheetIcon className="mr-1 inline size-4" />
        ) : note.kind === "drawing" ? (
          <PencilRulerIcon className="mr-1 inline size-4" />
        ) : (
          <FileTextIcon className="mr-1 inline size-4" />
        )}
        {note.title || "Untitled"}
      </h3>

      <p className="mt-1.5 flex-1 overflow-hidden text-sm whitespace-pre-line text-text-muted">
        {preview || <span className="text-subtle italic">Empty doc</span>}
      </p>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
        <span>
          {note.kind === "spreadsheet"
            ? "Spreadsheet"
            : note.kind === "drawing"
              ? "Drawing"
              : "Text"}{" "}
          ·
        </span>
        <span>{formatRelative(note.updatedAt)}</span>
        {!hideProject && note.project ? (
          <span className="flex min-w-0 items-center gap-1 truncate rounded-full bg-white/[0.06] px-1.5 py-0.5">
            <FolderIcon
              className="size-3 shrink-0"
              style={{ color: note.project.color ?? undefined }}
            />
            <span className="truncate">{note.project.name}</span>
          </span>
        ) : null}
      </div>
    </ItemMenu>
  )
}
