"use client"

import {
  useState,
  type ReactElement,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  FolderPlusIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  ExternalLinkIcon,
} from "lucide-react"
import { ItemMenu } from "@/components/ui/item-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useProjectTree,
  useUpdateProject,
  useDeleteProject,
} from "@/hooks/queries/projects"
import { useSettings, useUpdateSettings } from "@/hooks/queries/settings"
import { useShell } from "@/components/shell/shell-context"
import type { ProjectTreeNode } from "@/lib/projects/types"
import { buildProjectTree, findNode } from "@/lib/projects/tree"
import { DeleteProjectDialog } from "./delete-project-dialog"
import { ProjectIcon } from "./project-icon"
import { ProjectIconColorFields } from "./project-icon-picker"

export function ProjectItemMenu({
  project,
  trigger,
  children,
  onRename,
  onNewChild,
  onDelete,
  label = `${project.name} options`,
  buttonClassName,
}: {
  project: ProjectTreeNode
  trigger: ReactElement<HTMLAttributes<HTMLElement>>
  children?: ReactNode
  onRename?: () => void
  onNewChild?: () => void
  onDelete?: () => void
  label?: string
  buttonClassName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { openAddProject } = useShell()
  const update = useUpdateProject()
  const remove = useDeleteProject()
  const { data: flat = [] } = useProjectTree()
  const { data: settings } = useSettings()
  const preferences = useUpdateSettings()
  const [deleting, setDeleting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(project.name)
  const pinned = new Set(settings?.pinnedProjectIds ?? flat.map((p) => p.id))
  return (
    <>
      <ItemMenu
        trigger={trigger}
        label={label}
        buttonClassName={buttonClassName}
        actions={
          <>
            <DropdownMenuItem
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <ExternalLinkIcon />
              Open project
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!settings || preferences.isPending}
              onClick={() => {
                const ids = new Set(pinned)
                if (ids.has(project.id)) ids.delete(project.id)
                else ids.add(project.id)
                preferences.mutate({ pinnedProjectIds: [...ids] })
              }}
            >
              {pinned.has(project.id) ? <PinOffIcon /> : <PinIcon />}
              {pinned.has(project.id) ? "Unpin from sidebar" : "Pin to sidebar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onNewChild ?? (() => openAddProject(project.id))}
            >
              <FolderPlusIcon />
              New sub-project
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={
                onRename ??
                (() => {
                  setName(project.name)
                  setRenaming(true)
                })
              }
            >
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  id: project.id,
                  patch: { archived: !project.archivedAt },
                })
              }
            >
              {project.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {project.archivedAt ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ProjectIcon
                  icon={project.icon}
                  color={project.color}
                  size={14}
                />
                Icon & color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-72 overflow-hidden p-0">
                <ProjectIconColorFields project={project} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={onDelete ?? (() => setDeleting(true))}
            >
              <Trash2Icon />
              Delete…
            </DropdownMenuItem>
          </>
        }
      >
        {children}
      </ItemMenu>
      <Dialog
        open={renaming}
        onOpenChange={(open) => !update.isPending && setRenaming(open)}
      >
        <DialogContent>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Give this project a new name.</DialogDescription>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (update.isPending || !name.trim()) return
              update.mutate(
                { id: project.id, patch: { name: name.trim() } },
                { onSuccess: () => setRenaming(false) }
              )
            }}
          >
            <Input
              aria-label="Project name"
              value={name}
              maxLength={200}
              disabled={update.isPending}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              loading={update.isPending}
              disabled={!name.trim()}
            >
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <DeleteProjectDialog
        project={
          deleting
            ? (findNode(buildProjectTree(flat), project.id) ?? project)
            : null
        }
        onOpenChange={setDeleting}
        onConfirm={async (mode) => {
          await remove.mutateAsync({ id: project.id, mode })
          if (pathname === `/projects/${project.id}`) router.push("/resources")
        }}
      />
    </>
  )
}
