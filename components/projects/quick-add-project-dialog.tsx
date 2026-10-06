"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useCreateProject } from "@/hooks/queries/projects"

/** Shell-level "New project" dialog, opened from the top bar's Add menu —
 * the sidebar's inline create row (`sidebar-tree.tsx`) still exists for
 * creating in place, this is the reachable-from-anywhere equivalent. */
export function QuickAddProjectDialog() {
  const { addProject, closeAddProject } = useShell()
  const [name, setName] = useState("")
  const create = useCreateProject()
  const router = useRouter()

  function close() {
    setName("")
    closeAddProject()
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed || create.isPending) return
    create.mutate(
      { name: trimmed, parentId: addProject.parentId ?? null },
      {
        onSuccess: (project) => {
          close()
          router.push(`/projects/${project.id}`)
        },
      }
    )
  }

  return (
    <Dialog
      open={addProject.open}
      onOpenChange={(open) => !open && !create.isPending && close()}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {addProject.parentId ? "New sub-project" : "New project"}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          disabled={create.isPending}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
          }}
          placeholder="Project name"
        />
        <DialogFooter>
          <Button variant="outline" disabled={create.isPending} onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
