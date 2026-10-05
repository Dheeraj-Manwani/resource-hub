"use client"
import { LoaderCircleIcon } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ProjectTreeNode } from "@/lib/projects/types"
import { cn } from "@/lib/utils"

type Mode = "subtree" | "reparent"

export function DeleteProjectDialog({
  project,
  onOpenChange,
  onConfirm,
}: {
  project: ProjectTreeNode | null
  onOpenChange: (open: boolean) => void
  onConfirm: (mode: Mode) => unknown | Promise<unknown>
}) {
  const [mode, setMode] = useState<Mode>("subtree")
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const submitting = useRef(false)
  async function confirm() {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setFailed(false)
    try {
      await onConfirm(mode)
      setMode("subtree")
      onOpenChange(false)
    } catch {
      setFailed(true)
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  const hasChildren = !!project?.children.length

  return (
    <Dialog
      open={!!project}
      onOpenChange={(open) => {
        if (submitting.current) return
        setFailed(false)
        if (!open) setMode("subtree")
        onOpenChange(open)
      }}
    >
      <DialogContent>
        {project ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete &quot;{project.name}&quot;?</DialogTitle>
              <DialogDescription>
                Resources are never deleted — only unfiled from this project.
                They stay in your library and any other project they&apos;re
                also linked to.
              </DialogDescription>
            </DialogHeader>

            {hasChildren ? (
              <div className="space-y-2">
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm",
                    mode === "subtree" && "border-brand/50 bg-brand-soft"
                  )}
                >
                  <input
                    type="radio"
                    disabled={pending}
                    className="mt-0.5"
                    checked={mode === "subtree"}
                    onChange={() => setMode("subtree")}
                  />
                  <span>
                    <span className="font-medium">Delete whole subtree</span>
                    <span className="block text-xs text-text-muted">
                      This project and all {project.children.length} sub-project
                      {project.children.length === 1 ? "" : "s"} go with it.
                    </span>
                  </span>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm",
                    mode === "reparent" && "border-brand/50 bg-brand-soft"
                  )}
                >
                  <input
                    type="radio"
                    disabled={pending}
                    className="mt-0.5"
                    checked={mode === "reparent"}
                    onChange={() => setMode("reparent")}
                  />
                  <span>
                    <span className="font-medium">
                      Move children up a level
                    </span>
                    <span className="block text-xs text-text-muted">
                      Sub-projects keep their resources and move to where this
                      project was.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
            {failed ? (
              <p role="alert" className="text-sm text-destructive">
                Couldn&apos;t delete this project. Try again.
              </p>
            ) : null}

            <DialogFooter>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setFailed(false)
                  onOpenChange(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void confirm()}
              >
                {pending ? (
                  <LoaderCircleIcon
                    aria-hidden
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
