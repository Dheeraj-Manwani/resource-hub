"use client"

import {
  FolderMinusIcon,
  FolderPlusIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { ProjectSinglePicker } from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import { useBulkResourceActions } from "@/hooks/queries/projects"

export function BulkActionBar({
  selectedIds,
  currentProjectId,
  onClear,
}: {
  selectedIds: string[]
  /** When viewing a specific project, offers "Remove from this project". */
  currentProjectId?: string
  onClear: () => void
}) {
  const bulk = useBulkResourceActions()
  if (!selectedIds.length) return null

  return (
    <div className="pointer-events-none sticky bottom-4 z-20 mt-4 flex justify-center">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-surface-raised/95 px-3 py-1.5 shadow-popover backdrop-blur-md">
        <span className="px-2 text-sm font-medium">
          {selectedIds.length} selected
        </span>

        <ProjectSinglePicker
          value={null}
          onChange={(id) => {
            if (id)
              bulk.mutate({
                action: "link",
                resourceIds: selectedIds,
                projectId: id,
              })
          }}
          render={
            <Button
              size="sm"
              variant="ghost"
              disabled={bulk.isPending}
              loading={bulk.isPending && bulk.variables?.action === "link"}
            />
          }
        >
          <FolderPlusIcon />
          Add to project
        </ProjectSinglePicker>

        {currentProjectId ? (
          <Button
            disabled={bulk.isPending}
            loading={bulk.isPending && bulk.variables?.action === "unlink"}
            size="sm"
            variant="ghost"
            onClick={() =>
              bulk.mutate({
                action: "unlink",
                resourceIds: selectedIds,
                projectId: currentProjectId,
              })
            }
          >
            <FolderMinusIcon />
            Remove from this project
          </Button>
        ) : null}

        <Button
          disabled={bulk.isPending}
          loading={
            bulk.isPending &&
            bulk.variables?.action === "favorite" &&
            bulk.variables.value === true
          }
          size="sm"
          variant="ghost"
          onClick={() =>
            bulk.mutate({
              action: "favorite",
              resourceIds: selectedIds,
              value: true,
            })
          }
        >
          <StarIcon />
          Favorite
        </Button>
        <Button
          disabled={bulk.isPending}
          loading={
            bulk.isPending &&
            bulk.variables?.action === "favorite" &&
            bulk.variables.value === false
          }
          size="sm"
          variant="ghost"
          onClick={() =>
            bulk.mutate({
              action: "favorite",
              resourceIds: selectedIds,
              value: false,
            })
          }
        >
          <StarOffIcon />
          Unfavorite
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          disabled={bulk.isPending}
          loading={bulk.isPending && bulk.variables?.action === "delete"}
          onClick={() => {
            bulk.mutate(
              { action: "delete", resourceIds: selectedIds },
              { onSuccess: onClear }
            )
          }}
        >
          <Trash2Icon />
          Delete
        </Button>

        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Clear selection"
          disabled={bulk.isPending}
          onClick={onClear}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
