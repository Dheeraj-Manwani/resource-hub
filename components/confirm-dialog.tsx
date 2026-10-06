"use client"

import { Button } from "@/components/ui/button"
import { useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** Generic yes/no confirmation dialog for destructive actions (permanent
 * delete, empty trash, merge) that don't need the bespoke options
 * `DeleteProjectDialog` has (subtree vs. reparent). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => unknown | Promise<unknown>
}) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const submitting = useRef(false)
  const changeOpen = (next: boolean) => {
    if (!submitting.current) {
      setFailed(false)
      onOpenChange(next)
    }
  }
  async function confirm() {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setFailed(false)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      setFailed(true)
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t complete this action. Review the error and try again.
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            aria-busy={pending}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
