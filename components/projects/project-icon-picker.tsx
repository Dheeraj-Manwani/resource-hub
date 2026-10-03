"use client"

import { EmojiPicker } from "frimousse"
import { useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUpdateProject } from "@/hooks/queries/projects"
import { PROJECT_COLORS } from "@/lib/projects/types"
import { cn } from "@/lib/utils"

import { ProjectIcon } from "./project-icon"

const EMOJI_LIST_STYLES = cn(
  "[&_[frimousse-category-header]]:bg-popover [&_[frimousse-category-header]]:px-2.5 [&_[frimousse-category-header]]:pt-2 [&_[frimousse-category-header]]:pb-1 [&_[frimousse-category-header]]:text-xs [&_[frimousse-category-header]]:font-medium [&_[frimousse-category-header]]:text-muted-foreground",
  "[&_[frimousse-row]]:gap-0.5 [&_[frimousse-row]]:px-1.5",
  "[&_[frimousse-emoji]]:flex [&_[frimousse-emoji]]:size-8 [&_[frimousse-emoji]]:items-center [&_[frimousse-emoji]]:justify-center [&_[frimousse-emoji]]:rounded-md [&_[frimousse-emoji]]:text-lg [&_[frimousse-emoji]]:outline-none",
  "[&_[frimousse-emoji]:hover]:bg-muted [&_[frimousse-emoji][data-active]]:bg-muted"
)

/** The emoji search/grid + color swatch row, with no popover/dialog chrome
 * of its own — reused as-is inside a `Popover` (project page header) and a
 * `DropdownMenuSub` (sidebar row menu). */
export function ProjectIconColorFields({
  project,
  onDone,
}: {
  project: { id: string; icon: string | null; color: string | null }
  onDone?: () => void
}) {
  const update = useUpdateProject()

  return (
    <>
      <EmojiPicker.Root
        className="flex h-64 flex-col"
        onEmojiSelect={({ emoji }) => {
          update.mutate({ id: project.id, patch: { icon: emoji } })
          onDone?.()
        }}
      >
        <EmojiPicker.Search
          className="mx-2.5 mt-2.5 h-8 shrink-0 rounded-md border border-border bg-surface px-2.5 text-sm outline-none placeholder:text-subtle focus:border-brand/60"
          placeholder="Search emoji…"
        />
        <EmojiPicker.Viewport className={cn("mt-1.5 flex-1", EMOJI_LIST_STYLES)}>
          <EmojiPicker.Loading className="flex h-full items-center justify-center text-sm text-subtle">
            Loading…
          </EmojiPicker.Loading>
          <EmojiPicker.Empty className="flex h-full items-center justify-center text-sm text-subtle">
            No emoji found.
          </EmojiPicker.Empty>
          <EmojiPicker.List />
        </EmojiPicker.Viewport>
      </EmojiPicker.Root>
      <div className="border-t border-border p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Color</p>
          {project.icon ? (
            <button
              type="button"
              className="text-xs text-subtle hover:text-foreground"
              onClick={() => {
                update.mutate({ id: project.id, patch: { icon: null } })
                onDone?.()
              }}
            >
              Remove icon
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => update.mutate({ id: project.id, patch: { color: c } })}
              style={{ backgroundColor: c }}
              className={cn(
                "size-5 shrink-0 rounded-full ring-1 ring-black/20 transition-transform hover:scale-110",
                project.color === c && "ring-2 ring-white ring-offset-1 ring-offset-popover"
              )}
            />
          ))}
        </div>
      </div>
    </>
  )
}

/** Icon button that opens the icon/color fields in a popover — used wherever
 * a project is headlined (project page header, info modal). */
export function ProjectIconPicker({
  project,
  size = 28,
}: {
  project: { id: string; icon: string | null; color: string | null }
  size?: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Change project icon and color"
            className="flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface transition-colors hover:border-brand/40"
          />
        }
      >
        <span style={{ width: size + 12, height: size + 12 }} className="flex items-center justify-center">
          <ProjectIcon icon={project.icon} color={project.color} size={size} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-0">
        <ProjectIconColorFields project={project} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
