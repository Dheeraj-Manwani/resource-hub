"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export type OccurrenceScope = "this" | "following" | "all"

/** Prompts for how a change to one occurrence of a recurring task should
 * apply, matching the three semantics `editOccurrence` supports. */
export function OccurrenceScopeDialog({
  open,
  onOpenChange,
  onChoose,
  description,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChoose: (scope: OccurrenceScope) => Promise<unknown>
  description?: string
}) {
  const [pending, setPending] = useState<OccurrenceScope | null>(null)
  async function choose(scope: OccurrenceScope) {
    if (pending) return
    setPending(scope)
    try {
      await onChoose(scope)
    } catch {
      // The mutation reports the error; leave the scope available to retry.
    } finally {
      setPending(null)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>This is a recurring task</DialogTitle>
          <DialogDescription>
            {description ?? "Apply this change to:"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={!!pending}
            loading={pending === "this"}
            className="justify-start"
            onClick={() => void choose("this")}
          >
            This occurrence only
          </Button>
          <Button
            variant="outline"
            disabled={!!pending}
            loading={pending === "following"}
            className="justify-start"
            onClick={() => void choose("following")}
          >
            This and following occurrences
          </Button>
          <Button
            variant="outline"
            disabled={!!pending}
            loading={pending === "all"}
            className="justify-start"
            onClick={() => void choose("all")}
          >
            All occurrences
          </Button>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
