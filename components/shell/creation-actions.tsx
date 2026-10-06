"use client"

import {
  FolderPlusIcon,
  LinkIcon,
  ListPlusIcon,
  NotebookPenIcon,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useProjectOptions } from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import { useShell } from "./shell-context"

/** Global creation actions keep the current project, including nested projects. */
export function useCreationActions() {
  const shell = useShell()
  const { projectId } = useParams<{ projectId?: string }>()
  const { options } = useProjectOptions()
  const project = options.find((option) => option.id === projectId)
  return {
    ...shell,
    openAddResource: (text?: string) =>
      shell.openAddResource(text, projectId ? [projectId] : undefined),
    openAddTask: (text?: string) =>
      shell.openAddTask(text, {
        defaultProject: projectId
          ? { id: projectId, name: project?.name ?? "" }
          : undefined,
      }),
    openAddProject: () => shell.openAddProject(projectId),
    openAddQuickNote: () => shell.openAddQuickNote(projectId),
  }
}

export function CreationActions() {
  const { openAddResource, openAddTask, openAddProject, openAddQuickNote } =
    useCreationActions()
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => openAddResource()}>
        <LinkIcon />
        Add resource
      </Button>
      <Button size="sm" variant="outline" onClick={() => openAddTask()}>
        <ListPlusIcon />
        Add task
      </Button>
      <Button size="sm" variant="outline" onClick={() => openAddProject()}>
        <FolderPlusIcon />
        New project
      </Button>
      <Button size="sm" variant="outline" onClick={() => openAddQuickNote()}>
        <NotebookPenIcon />
        New quick note
      </Button>
    </div>
  )
}
