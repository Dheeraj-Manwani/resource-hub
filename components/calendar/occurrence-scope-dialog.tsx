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
  onChoose: (scope: OccurrenceScope) => void
  description?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>This is a recurring task</DialogTitle>
          <DialogDescription>
            {description ?? "Apply this change to:"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="justify-start" onClick={() => onChoose("this")}>
            This occurrence only
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onChoose("following")}>
            This and following occurrences
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onChoose("all")}>
            All occurrences
          </Button>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
