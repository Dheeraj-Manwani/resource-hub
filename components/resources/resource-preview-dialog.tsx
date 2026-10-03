"use client"

import {
  CheckCircle2Icon,
  CircleIcon,
  Edit,
  ExternalLinkIcon,
  StarIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useResource, useUpdateResource } from "@/hooks/queries/resources"
import { displayTitle } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

import { MetaLine, ProjectChips, TagChips, TaskCountChip } from "./cards/card-parts"
import { ResourceFullView } from "./full-view/resource-full-view"
import { useLightbox } from "./lightbox/lightbox-provider"
import { TypeBadge } from "./type-icon"

function PreviewSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="aspect-video w-full rounded-lg" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

/** Large, read-only preview of a resource, with a button to jump into editing it. */
export function ResourcePreviewDialog({
  id,
  onClose,
  onEdit,
}: {
  id: string | null
  onClose: () => void
  onEdit: (id: string) => void
}) {
  const { data: resource, isPending, isError } = useResource(id)
  const update = useUpdateResource()
  const { openImages } = useLightbox()

  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        {!resource ? (
          isError ? (
            <div className="p-6">
              <DialogTitle className="sr-only">Not found</DialogTitle>
              <EmptyState
                icon={TriangleAlertIcon}
                title="Resource not found"
                description="It may have been deleted."
              />
            </div>
          ) : isPending ? (
            <>
              <DialogTitle className="sr-only">Loading resource</DialogTitle>
              <PreviewSkeleton />
            </>
          ) : null
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-border px-4 py-2.5 pr-12">
              <TypeBadge type={resource.type} />
              <div className="ml-auto flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={
                          resource.isFavorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        aria-pressed={resource.isFavorite}
                        onClick={() =>
                          update.mutate({
                            id: resource.id,
                            patch: { isFavorite: !resource.isFavorite },
                          })
                        }
                      />
                    }
                  >
                    <StarIcon
                      className={cn(resource.isFavorite && "fill-brand text-brand")}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Favorite</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={
                          resource.isReviewed
                            ? "Mark as not reviewed"
                            : "Mark as reviewed"
                        }
                        aria-pressed={resource.isReviewed}
                        onClick={() =>
                          update.mutate({
                            id: resource.id,
                            patch: { isReviewed: !resource.isReviewed },
                          })
                        }
                      />
                    }
                  >
                    {resource.isReviewed ? (
                      <CheckCircle2Icon className="text-emerald-400" />
                    ) : (
                      <CircleIcon />
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    {resource.isReviewed ? "Reviewed" : "Mark reviewed"}
                  </TooltipContent>
                </Tooltip>
                {resource.url ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Open original"
                          nativeButton={false}
                          render={
                            <a
                              href={resource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                        />
                      }
                    >
                      <ExternalLinkIcon />
                    </TooltipTrigger>
                    <TooltipContent>Open original</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="space-y-1">
                <DialogTitle className="text-lg font-semibold">
                  {displayTitle(resource)}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Resource preview
                </DialogDescription>
                <MetaLine resource={resource} />
              </div>

              <ResourceFullView
                resource={resource}
                onOpenImage={(imgId) => openImages([resource], imgId)}
                interactive={false}
              />

              {resource.notes ? (
                <p className="text-sm whitespace-pre-line text-text-muted">
                  {resource.notes}
                </p>
              ) : null}

              {resource.projects.length || resource.taskCount ? (
                <div className="flex flex-wrap gap-1">
                  <ProjectChips projects={resource.projects} />
                  <TaskCountChip count={resource.taskCount} />
                </div>
              ) : null}

              <TagChips tags={resource.tags} max={12} />
            </div>

            <DialogFooter className="mx-0 mb-0 rounded-t-none border-t border-border bg-transparent px-4 py-3">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => onEdit(resource.id)}>
                <Edit />
                Edit
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
