"use client"

import { Loader2Icon, SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useQuickNotes, useUpdateQuickNote } from "@/hooks/queries/quick-notes"
import { cn } from "@/lib/utils"

/** Links quick notes written elsewhere (unlinked, or filed under another
 * project) into this project — the inverse of creating one scoped to it
 * directly from the Notes tab. */
export function AddExistingQuickNoteDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { data: notes = [], isPending } = useQuickNotes()
  const update = useUpdateQuickNote()

  const candidates = useMemo(
    () => notes.filter((n) => n.projectId !== projectId),
    [notes, projectId]
  )
  const filtered = query.trim()
    ? candidates.filter((n) =>
        (n.title || "Untitled").toLowerCase().includes(query.trim().toLowerCase())
      )
    : candidates

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function close() {
    setSelected(new Set())
    setQuery("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add existing notes</DialogTitle>
          <DialogDescription>
            Link quick notes you already wrote into this project.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title…"
            className="pl-8"
          />
        </div>

        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
          {isPending ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="size-5 animate-spin text-subtle" />
            </div>
          ) : filtered.length ? (
            filtered.map((n) => (
              <label
                key={n.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-white/[0.04]"
              >
                <Checkbox
                  checked={selected.has(n.id)}
                  onCheckedChange={() => toggle(n.id)}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    !n.title && "text-subtle"
                  )}
                >
                  {n.title || "Untitled"}
                </span>
              </label>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-subtle">
              {candidates.length ? "No matches" : "Nothing left to add"}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!selected.size || update.isPending}
            onClick={() => {
              selected.forEach((id) => update.mutate({ id, projectId }))
              close()
            }}
          >
            {update.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Add {selected.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
