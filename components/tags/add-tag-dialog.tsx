"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useCreateTag } from "@/hooks/queries/tags"

export function AddTagDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState("")
  const create = useCreateTag()
  function close() {
    setName("")
    onOpenChange(false)
  }
  function submit() {
    const trimmed = name.trim().replace(/^#/, "").trim()
    if (!trimmed || create.isPending) return
    create.mutate(trimmed, { onSuccess: close })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !create.isPending) close()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New tag</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Tag name"
          maxLength={50}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
          placeholder="Tag name"
          disabled={create.isPending}
        />
        <DialogFooter>
          <Button variant="outline" disabled={create.isPending} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim().replace(/^#/, "").trim() || create.isPending}
            onClick={submit}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
