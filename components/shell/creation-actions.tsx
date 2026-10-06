"use client"

import {
  FolderPlusIcon,
  LinkIcon,
  ListPlusIcon,
  NotebookPenIcon,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useProjectOptions } from "@/components/projects/project-picker"
import { AddMenu } from "@/components/add-menu"
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
    <AddMenu
      items={[
        {
          label: "Add resource",
          icon: <LinkIcon />,
          onSelect: () => openAddResource(),
        },
        {
          label: "Add task",
          icon: <ListPlusIcon />,
          onSelect: () => openAddTask(),
        },
        {
          label: "New project",
          icon: <FolderPlusIcon />,
          onSelect: () => openAddProject(),
        },
        {
          label: "New quick note",
          icon: <NotebookPenIcon />,
          onSelect: () => openAddQuickNote(),
        },
      ]}
    />
  )
}
