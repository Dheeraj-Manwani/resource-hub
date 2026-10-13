"use client"

import {
  ArrowUpRightIcon,
  FolderIcon,
  Trash2Icon,
  FileTextIcon,
  SheetIcon,
  PencilRulerIcon,
  PencilIcon,
} from "lucide-react"
import { formatRelative } from "@/lib/format"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"
import { ItemMenu } from "@/components/ui/item-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { DocumentCardPreview } from "./document-card-preview"

const appearances = {
  text: {
    label: "Text doc",
    icon: FileTextIcon,
    color: "bg-sky-400/10 text-sky-300 ring-sky-400/15",
  },
  spreadsheet: {
    label: "Spreadsheet",
    icon: SheetIcon,
    color: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/15",
  },
  drawing: {
    label: "Drawing",
    icon: PencilRulerIcon,
    color: "bg-violet-400/10 text-violet-300 ring-violet-400/15",
  },
}

export function QuickNoteCard({
  note,
  onOpen,
  onDelete,
  hideProject,
}: {
  note: QuickNoteDto
  onOpen: () => void
  onDelete: () => void
  /** Suppress the project badge on the project's own Docs tab. */
  hideProject?: boolean
}) {
  const appearance = appearances[note.kind]
  const Icon = appearance.icon
  const title = note.title || "Untitled"
  return (
    <ItemMenu
      label={`${title} options`}
      buttonClassName="absolute top-4 right-3 text-subtle"
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
          aria-label={`Open ${title}`}
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (
              (e.key === "Enter" || e.key === " ") &&
              e.target === e.currentTarget
            ) {
              e.preventDefault()
              onOpen()
            }
          }}
          className="group relative flex h-68 min-w-0 cursor-pointer flex-col rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      }
    >
      <div className="flex h-15 min-w-0 shrink-0 items-start gap-3 pr-7">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${appearance.color}`}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-medium tracking-wide text-subtle">
            {appearance.label}
          </p>
          <h3
            title={title}
            className="line-clamp-2 text-[15px] leading-5 font-semibold break-words text-foreground"
          >
            {title}
          </h3>
        </div>
      </div>
      <div className="my-4 min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70 bg-background/40">
        <DocumentCardPreview note={note} />
      </div>
      <div className="flex min-w-0 items-center gap-2 text-[11px] text-subtle">
        {!hideProject && note.project ? (
          <span
            className="flex min-w-0 items-center gap-1.5"
            title={note.project.name}
          >
            <FolderIcon
              aria-hidden="true"
              className="size-3.5 shrink-0"
              style={{ color: note.project.color ?? undefined }}
            />
            <span className="truncate">{note.project.name}</span>
          </span>
        ) : (
          <span className="truncate">
            {hideProject ? "Updated" : "Personal doc"}
          </span>
        )}
        <span className="ml-auto shrink-0">
          {formatRelative(note.updatedAt)}
        </span>
        <ArrowUpRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-subtle transition-colors group-hover:text-foreground"
        />
      </div>
    </ItemMenu>
  )
}
