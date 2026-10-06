"use client"

import { Component, type ReactNode } from "react"

import { LoadingState } from "@/components/query-feedback"

import { Button } from "@/components/ui/button"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

export function AsyncDialogFeedback({
  label,
  onClose,
  failed = false,
}: {
  label: string
  onClose: () => void
  failed?: boolean
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{failed ? `Couldn't open ${label}` : label}</DialogTitle>
          <DialogDescription className={failed ? undefined : "sr-only"}>
            {failed
              ? "The viewer could not be loaded. Reload the page to try again."
              : "Viewer"}
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            Viewer unavailable.
          </p>
        ) : (
          <LoadingState label={`Loading ${label}…`} />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {failed ? (
            <Button onClick={() => window.location.reload()}>
              Reload page
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export class AsyncDialogBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
