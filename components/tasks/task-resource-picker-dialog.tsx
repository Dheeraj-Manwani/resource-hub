"use client"

import { QueryFeedback } from "@/components/query-feedback"

import { Loader2Icon, SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { TypeIcon } from "@/components/resources/type-icon"
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
import { useResourceList } from "@/hooks/queries/resources"
import { useLinkTaskResources } from "@/hooks/queries/tasks"
import { displayTitle } from "@/lib/resources/dto"

/** Links existing library resources to a task, filtered client-side by
 * title (full-text search across the library arrives in Phase 6). */
export function TaskResourcePickerDialog({
  taskId,
  excludeIds,
  open,
  onOpenChange,
}: {
  taskId: string
  excludeIds: Set<string>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const resourcesQuery = useResourceList({
    sort: "created",
    order: "desc",
  })
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    resourcesQuery
  const link = useLinkTaskResources()

  const items = useMemo(
    () =>
      (data?.pages.flatMap((p) => p.items) ?? []).filter(
        (r) => !excludeIds.has(r.id)
      ),
    [data, excludeIds]
  )
  const filtered = query.trim()
    ? items.filter((r) =>
        displayTitle(r).toLowerCase().includes(query.trim().toLowerCase())
      )
    : items

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
    <Dialog
      open={open}
      onOpenChange={(o) => (!o && !link.isPending ? close() : undefined)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link resources</DialogTitle>
          <DialogDescription>
            Pick resources from your library to attach to this task.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            disabled={link.isPending}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title…"
            className="pl-8"
          />
        </div>

        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
          <QueryFeedback
            query={resourcesQuery}
            label="resources"
            loading={false}
          />
          {isPending ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="size-5 animate-spin text-subtle" />
            </div>
          ) : filtered.length ? (
            filtered.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-white/[0.04]"
              >
                <Checkbox
                  disabled={link.isPending}
                  checked={selected.has(r.id)}
                  onCheckedChange={() => toggle(r.id)}
                />
                <TypeIcon type={r.type} />
                <span className="min-w-0 flex-1 truncate">
                  {displayTitle(r)}
                </span>
              </label>
            ))
          ) : resourcesQuery.isError && !data ? null : (
            <p className="py-8 text-center text-sm text-subtle">
              {items.length ? "No matches" : "Your library is empty"}
            </p>
          )}
          {hasNextPage ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {isFetchingNextPage ? (
                <Loader2Icon className="animate-spin" />
              ) : null}
              Load more
            </Button>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={link.isPending} onClick={close}>
            Cancel
          </Button>
          <Button
            loading={link.isPending}
            disabled={!selected.size || link.isPending}
            onClick={() =>
              link.mutate(
                { taskId, resourceIds: [...selected] },
                { onSuccess: close }
              )
            }
          >
            Add {selected.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
