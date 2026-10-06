"use client"

import { useEffect, useMemo, useState } from "react"

import { useProjectOptions } from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useMoveResources } from "@/hooks/queries/projects"
import {
  useResourceList,
  type ResourceFilters,
} from "@/hooks/queries/resources"
import { displayTitle } from "@/lib/resources/dto"

import { TypeIcon } from "./type-icon"

const FILTERS: ResourceFilters = {
  unsorted: true,
  sort: "created",
  order: "desc",
}

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null
  return (
    !!node &&
    (node.tagName === "INPUT" ||
      node.tagName === "TEXTAREA" ||
      node.isContentEditable)
  )
}

/** Keyboard-driven Inbox triage: J/K move between items, P opens a project
 * picker for the focused item, Enter re-files to the last-picked project and
 * advances (or opens the picker, the first time). */
export function InboxTriageBar() {
  const { data } = useResourceList(FILTERS)
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const [index, setIndex] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lastProjectId, setLastProjectId] = useState<string | null>(null)
  const move = useMoveResources()
  const { options } = useProjectOptions()
  const safeIndex = Math.min(index, Math.max(items.length - 1, 0))
  const current = items[safeIndex] ?? null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || !items.length || move.isPending) return
      if (e.key === "j") {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === "k") {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault()
        setPickerOpen(true)
      } else if (e.key === "Enter" && current) {
        e.preventDefault()
        if (lastProjectId) {
          move.mutate({
            resourceIds: [current.id],
            from: null,
            to: lastProjectId,
          })
          setIndex((i) => Math.min(i + 1, items.length - 1))
        } else {
          setPickerOpen(true)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, items.length, lastProjectId, move])

  if (!items.length && !pickerOpen) return null

  function fileCurrentIn(projectId: string) {
    if (!current || move.isPending) return
    move.mutate(
      { resourceIds: [current.id], from: null, to: projectId },
      {
        onSuccess: () => {
          setLastProjectId(projectId)
          setPickerOpen(false)
        },
      }
    )
  }

  return (
    <>
      <div className="pointer-events-none sticky bottom-4 z-20 mt-6 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface-raised/95 px-4 py-2 text-xs text-text-muted shadow-popover backdrop-blur-md">
          {current ? (
            <span className="flex max-w-40 items-center gap-1.5 truncate font-medium text-foreground sm:max-w-64">
              <TypeIcon type={current.type} /> {displayTitle(current)}
            </span>
          ) : null}
          <span className="shrink-0 text-subtle tabular-nums">
            {safeIndex + 1}/{items.length}
          </span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans">J</kbd>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans">K</kbd>
            move
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans">P</kbd>
            file
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans">↵</kbd>
            {lastProjectId ? "file & next" : "pick"}
          </span>
        </div>
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => !move.isPending && setPickerOpen(open)}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="truncate">
              File &quot;{current ? displayTitle(current) : ""}&quot;
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.length ? (
              options.map((o) => (
                <Button
                  key={o.id}
                  variant="ghost"
                  disabled={move.isPending}
                  loading={move.isPending && move.variables?.to === o.id}
                  onClick={() => fileCurrentIn(o.id)}
                  style={{ paddingLeft: `${o.depth * 16 + 8}px` }}
                  className="flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm hover:bg-white/[0.06]"
                >
                  {o.name}
                </Button>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-sm text-subtle">
                Create a project first
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
