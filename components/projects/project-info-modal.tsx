"use client"

import { PencilIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  useProject,
  useProjectTree,
  useUpdateProject,
} from "@/hooks/queries/projects"
import { useProjectTaskProgress } from "@/hooks/queries/tasks"
import { formatDate } from "@/lib/format"

import { ProjectIcon } from "./project-icon"
import { ProjectIconPicker } from "./project-icon-picker"

export function ProjectInfoModal({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data } = useProject(projectId)
  const { data: tree } = useProjectTree()
  const { data: progress } = useProjectTaskProgress(projectId, false)
  const update = useUpdateProject()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const project = data?.project
  const subProjectCount =
    tree?.filter((p) => p.parentId === projectId).length ?? 0

  function startEditing() {
    if (!project) return
    setName(project.name)
    setDescription(project.description ?? "")
    setEditing(true)
  }

  function save() {
    const trimmed = name.trim()
    if (!trimmed || !project) return
    update.mutate(
      {
        id: projectId,
        patch: { name: trimmed, description: description.trim() || null },
      },
      { onSuccess: () => setEditing(false) }
    )
  }

  function handleOpenChange(next: boolean) {
    if (update.isPending) return
    if (!next) setEditing(false)
    onOpenChange(next)
  }

  if (!project) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {editing ? (
          <>
            <DialogTitle>Edit project</DialogTitle>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Icon & color
                </label>
                <ProjectIconPicker project={project} size={20} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this project for?"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button
                loading={update.isPending}
                onClick={save}
                disabled={!name.trim() || update.isPending}
              >
                Save
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 pr-6">
              <ProjectIcon
                icon={project.icon}
                color={project.color}
                size={28}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <DialogTitle className="text-lg">{project.name}</DialogTitle>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    aria-label="Edit project info"
                    onClick={startEditing}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                </div>
                <DialogDescription className="mt-1 whitespace-pre-wrap">
                  {project.description || "No description yet."}
                </DialogDescription>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface p-3 text-center">
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {project.directCount}
                </p>
                <p className="text-xs text-subtle">Resources</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {progress?.total ?? 0}
                </p>
                <p className="text-xs text-subtle">Tasks</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {subProjectCount}
                </p>
                <p className="text-xs text-subtle">Sub-projects</p>
              </div>
            </div>
            <p className="text-xs text-subtle">
              Created {formatDate(project.createdAt)}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
