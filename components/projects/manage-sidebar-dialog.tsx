"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLinkIcon, SearchIcon } from "lucide-react"
import { useUpdateSettings } from "@/hooks/queries/settings"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ancestorChain,
  buildProjectTree,
  flattenTree,
} from "@/lib/projects/tree"
import type { ProjectDto } from "@/lib/projects/types"
import { ProjectIcon } from "./project-icon"

export function ManageSidebarDialog({
  projects,
  pinnedProjectIds,
  onClose,
}: {
  projects: ProjectDto[]
  pinnedProjectIds: string[] | null
  onClose: () => void
}) {
  const [selected, setSelected] = useState(
    () => new Set(pinnedProjectIds ?? projects.map((project) => project.id))
  )
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const update = useUpdateSettings()
  const ordered = flattenTree(buildProjectTree(projects), () => false)
  const shown = ordered.filter((project) =>
    `${ancestorChain(projects, project.id)
      .map((ancestor) => ancestor.name)
      .join(" / ")} / ${project.name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !update.isPending && onClose()}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Manage sidebar</DialogTitle>
        <DialogDescription>
          Choose the projects you use now. Others stay available under More
          projects. Parent paths remain visible for selected sub-projects.
        </DialogDescription>
        <div className="relative">
          <SearchIcon className="absolute top-2.5 left-3 size-4 text-subtle" />
          <Input
            aria-label="Search sidebar projects"
            placeholder="Search all projects…"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-muted">
            {projects.filter((project) => selected.has(project.id)).length} of{" "}
            {projects.length} selected
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() =>
                setSelected(new Set(projects.map((project) => project.id)))
              }
            >
              Select all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
          </div>
        </div>
        <div className="max-h-[50dvh] space-y-1 overflow-y-auto">
          {shown.map((project) => {
            const path = ancestorChain(projects, project.id)
              .map((ancestor) => ancestor.name)
              .join(" / ")
            return (
              <div
                key={project.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"
              >
                <Checkbox
                  aria-label={project.name}
                  checked={selected.has(project.id)}
                  disabled={update.isPending}
                  onCheckedChange={(checked) =>
                    setSelected((previous) => {
                      const next = new Set(previous)
                      if (checked) next.add(project.id)
                      else next.delete(project.id)
                      return next
                    })
                  }
                />
                <ProjectIcon
                  icon={project.icon}
                  color={project.color}
                  size={16}
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{project.name}</span>
                  {path && (
                    <span className="block truncate text-xs text-subtle">
                      {path}
                    </span>
                  )}
                </div>
                <Link
                  href={`/projects/${project.id}`}
                  onClick={onClose}
                  aria-label={`Open ${project.name}`}
                  className="rounded p-1 text-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ExternalLinkIcon className="size-4" />
                </Link>
              </div>
            )
          })}
          {!shown.length && (
            <p className="py-6 text-center text-sm text-subtle">
              No matching projects.
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={update.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            disabled={update.isPending}
            onClick={async () => {
              setError("")
              try {
                const ids = projects
                  .filter((project) => selected.has(project.id))
                  .map((project) => project.id)
                await update.mutateAsync({
                  pinnedProjectIds: ids.length === projects.length ? null : ids,
                })
                onClose()
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not save sidebar choices."
                )
              }
            }}
          >
            Save selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
