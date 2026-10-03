"use client"

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  FolderIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { LibraryView } from "@/components/resources/library-view"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  useDeleteProject,
  useProject,
  useUpdateProject,
} from "@/hooks/queries/projects"
import type { SettingsDto } from "@/lib/server/dal/settings"

import { AddExistingDialog } from "./add-existing-dialog"
import { DeleteProjectDialog } from "./delete-project-dialog"

function Breadcrumbs({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId)
  if (!data) return null
  return (
    <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-sm text-subtle">
      <Link href="/library" className="hover:text-text-muted hover:underline">
        Library
      </Link>
      {data.ancestors.map((p) => (
        <span key={p.id} className="flex items-center gap-1">
          <ChevronRightIcon className="size-3.5" />
          <Link href={`/projects/${p.id}`} className="hover:text-text-muted hover:underline">
            {p.name}
          </Link>
        </span>
      ))}
      <ChevronRightIcon className="size-3.5" />
      <span className="text-text-muted">{data.project.name}</span>
    </nav>
  )
}

function EditableName({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId)
  const update = useUpdateProject()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  if (!data) return <span className="inline-block h-7 w-40 animate-pulse rounded bg-white/5" />

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const trimmed = draft.trim()
          if (trimmed && trimmed !== data.project.name)
            update.mutate({ id: projectId, patch: { name: trimmed } })
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "Escape") setEditing(false)
        }}
        className="h-9 w-full rounded-md border border-border-strong bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none focus-visible:border-brand/60"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(data.project.name)
        setEditing(true)
      }}
      className="flex items-center gap-2 text-left text-2xl font-semibold tracking-tight hover:text-brand"
    >
      <FolderIcon
        className="size-5 shrink-0"
        style={{ color: data.project.color ?? undefined }}
      />
      {data.project.name}
    </button>
  )
}

function EditableDescription({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId)
  const update = useUpdateProject()
  const [draft, setDraft] = useState<string | null>(null)
  if (!data) return null
  const value = draft ?? data.project.description ?? ""
  return (
    <Textarea
      value={value}
      placeholder="What's this project for?"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== (data.project.description ?? ""))
          update.mutate({ id: projectId, patch: { description: draft || null } })
        setDraft(null)
      }}
      rows={2}
      className="mt-1 resize-none border-transparent bg-transparent px-0 text-sm text-text-muted shadow-none hover:border-border focus-visible:border-border-strong focus-visible:px-2"
    />
  )
}

function ProjectMenu({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId)
  const update = useUpdateProject()
  const deleteProject = useDeleteProject()
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  if (!data) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" aria-label="Project options" />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              update.mutate({
                id: projectId,
                patch: { archived: !data.project.archivedAt },
              })
            }
          >
            {data.project.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {data.project.archivedAt ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2Icon />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteProjectDialog
        project={deleting ? { ...data.project, depth: 0, totalCount: 0, children: [] } : null}
        onOpenChange={(open) => !open && setDeleting(false)}
        onConfirm={(mode) => {
          deleteProject.mutate(
            { id: projectId, mode },
            { onSuccess: () => router.push("/library") }
          )
          setDeleting(false)
        }}
      />
    </>
  )
}

export function ProjectPage({
  projectId,
  initialSettings,
}: {
  projectId: string
  initialSettings: SettingsDto
}) {
  const { data, isError } = useProject(projectId)
  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [addingExisting, setAddingExisting] = useState(false)

  const baseFilters = useMemo(
    () => ({ projectId, includeDescendants }),
    [projectId, includeDescendants]
  )

  if (isError) {
    return (
      <p className="py-16 text-center text-sm text-subtle">
        This project doesn&apos;t exist or was deleted.
      </p>
    )
  }

  return (
    <>
      <Breadcrumbs projectId={projectId} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <EditableName projectId={projectId} />
          <EditableDescription projectId={projectId} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <Switch
              size="sm"
              checked={includeDescendants}
              onCheckedChange={setIncludeDescendants}
            />
            Include sub-projects
          </label>
          <Button variant="outline" size="sm" onClick={() => setAddingExisting(true)}>
            <ListPlusIcon />
            Add existing
          </Button>
          <ProjectMenu projectId={projectId} />
        </div>
      </div>

      <p className="mb-4 text-xs text-subtle">
        Task progress for this project arrives in Phase 4.
      </p>

      <LibraryView
        title={data?.project.name ?? "Project"}
        initialSettings={initialSettings}
        baseFilters={baseFilters}
        emptyTitle="Nothing filed here yet"
        emptyDescription="Drag a resource onto this project in the sidebar, use the bulk action bar, or add existing Inbox items."
        hideHeader
      />

      <AddExistingDialog
        projectId={projectId}
        open={addingExisting}
        onOpenChange={setAddingExisting}
      />
    </>
  )
}
