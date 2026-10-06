"use client"

import { QueryFeedback } from "@/components/query-feedback"

import { Loader2Icon, SearchIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"

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
  const notesQuery = useQuickNotes()
  const { data: notes = [], isPending } = notesQuery
  const [linking, setLinking] = useState(false)
  const [failed, setFailed] = useState(false)
  const submitting = useRef(false)
  const update = useUpdateQuickNote()

  const candidates = useMemo(
    () => notes.filter((n) => n.projectId !== projectId),
    [notes, projectId]
  )
  const filtered = query.trim()
    ? candidates.filter((n) =>
        (n.title || "Untitled")
          .toLowerCase()
          .includes(query.trim().toLowerCase())
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
    setFailed(false)
    onOpenChange(false)
  }

  async function submit() {
    if (submitting.current || !selected.size) return
    submitting.current = true
    setLinking(true)
    setFailed(false)
    const ids = [...selected]
    try {
      const results = await Promise.allSettled(
        ids.map((id) => update.mutateAsync({ id, projectId }))
      )
      const remaining = ids.filter(
        (_id, index) => results[index].status === "rejected"
      )
      setSelected(new Set(remaining))
      if (remaining.length) setFailed(true)
      else close()
    } finally {
      submitting.current = false
      setLinking(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (!o && !submitting.current ? close() : undefined)}
    >
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
            disabled={linking}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title…"
            className="pl-8"
          />
        </div>

        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
          <QueryFeedback query={notesQuery} label="notes" loading={false} />
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
                  disabled={linking}
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
          ) : notesQuery.isError && !notesQuery.data ? null : (
            <p className="py-8 text-center text-sm text-subtle">
              {candidates.length ? "No matches" : "Nothing left to add"}
            </p>
          )}
        </div>

        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            Some notes could not be linked. Failed selections are kept; try
            again.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" disabled={linking} onClick={close}>
            Cancel
          </Button>
          <Button
            loading={linking}
            disabled={!selected.size || linking}
            onClick={() => void submit()}
          >
            {`Add ${selected.size || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
