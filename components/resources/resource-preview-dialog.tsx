"use client"

import { QueryFeedback } from "@/components/query-feedback"

import {
  CheckCircle2Icon,
  CircleIcon,
  Edit,
  ExternalLinkIcon,
  InfoIcon,
  StarIcon,
} from "lucide-react"
import { useState } from "react"

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
import {
  FILE_PREVIEW_LABELS,
  resourcePreviewKind,
} from "@/lib/resources/preview"
import { cn } from "@/lib/utils"

import {
  MetaLine,
  ProjectChips,
  TagChips,
  TaskCountChip,
} from "./cards/card-parts"
import { ResourceFullView } from "./full-view/resource-full-view"
import { FilePreview } from "./full-view/file-preview"
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
  const query = useResource(id)
  const { data: resource, isPending, isError } = query
  const update = useUpdateResource()
  const { openImages } = useLightbox()
  const [showDetails, setShowDetails] = useState(false)
  const kind = resource ? resourcePreviewKind(resource) : "link"
  const fileView =
    !!resource &&
    (resource.type === "file" ||
      !!resource.file ||
      [
        "pdf",
        "spreadsheet",
        "document",
        "text",
        "video",
        "audio",
        "presentation",
        "archive",
      ].includes(kind))
  const wide = ["pdf", "spreadsheet", "document", "text", "github"].includes(
    kind
  )
  const media = ["image", "video", "youtube", "pinterest"].includes(kind)
  const social = ["instagram", "x"].includes(kind)
  const reader = ["note", "link"].includes(kind)

  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        data-preview-kind={kind}
        className={cn(
          "flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl",
          wide && "h-[88dvh] max-w-6xl sm:max-w-6xl",
          media && "max-w-5xl sm:max-w-5xl",
          social && "max-w-2xl sm:max-w-2xl",
          kind === "audio" && "max-w-2xl sm:max-w-2xl"
        )}
      >
        {!resource ? (
          isError ? (
            <div className="p-6">
              <DialogTitle className="sr-only">
                Unable to load resource
              </DialogTitle>
              <DialogDescription className="sr-only">
                Resource preview
              </DialogDescription>
              <QueryFeedback query={query} label="resource" />
            </div>
          ) : isPending ? (
            <>
              <DialogTitle className="sr-only">Loading resource</DialogTitle>
              <PreviewSkeleton />
            </>
          ) : null
        ) : (
          <>
            <div className="px-4">
              <QueryFeedback query={query} label="resource" loading={false} />
            </div>
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5 pr-12">
              {fileView ? (
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                  {FILE_PREVIEW_LABELS[
                    kind as keyof typeof FILE_PREVIEW_LABELS
                  ] ?? "File"}
                </span>
              ) : (
                <TypeBadge type={resource.type} />
              )}
              <span className="hidden text-xs text-text-muted sm:inline">
                Preview
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Resource details"
                        aria-expanded={showDetails}
                        aria-controls="resource-preview-details"
                        onClick={() => setShowDetails((show) => !show)}
                      />
                    }
                  >
                    <InfoIcon />
                  </TooltipTrigger>
                  <TooltipContent>Resource details</TooltipContent>
                </Tooltip>
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
                        loading={
                          update.isPending &&
                          update.variables?.patch.isFavorite !== undefined
                        }
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
                      className={cn(
                        resource.isFavorite && "fill-brand text-brand"
                      )}
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
                        loading={
                          update.isPending &&
                          update.variables?.patch.isReviewed !== undefined
                        }
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

            <div className="shrink-0 space-y-1 border-b border-border px-5 py-3">
              <DialogTitle
                className="truncate text-lg font-semibold"
                title={displayTitle(resource)}
              >
                {displayTitle(resource)}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {fileView
                  ? `${FILE_PREVIEW_LABELS[kind as keyof typeof FILE_PREVIEW_LABELS] ?? "File"} preview`
                  : "Resource preview"}
                . Read the resource here or choose Edit to change its details.
              </DialogDescription>
              <MetaLine resource={resource} />
            </div>
            <div
              className={cn(
                "min-h-0 flex-1",
                wide && fileView ? "overflow-hidden" : "overflow-y-auto",
                media && "bg-black/90",
                reader && "bg-muted/30"
              )}
            >
              {fileView ? (
                <FilePreview
                  key={resource.file?.id ?? resource.url ?? resource.id}
                  resource={resource}
                  onOpenImage={(imgId) => openImages([resource], imgId)}
                  modal
                />
              ) : (
                <div
                  className={cn(
                    "p-5",
                    reader &&
                      "mx-auto my-5 max-w-3xl rounded-sm border border-border bg-surface p-6 shadow-sm sm:p-10",
                    social && "mx-auto max-w-[590px]",
                    kind === "github" && "space-y-4"
                  )}
                >
                  <ResourceFullView
                    resource={resource}
                    onOpenImage={(imgId) => openImages([resource], imgId)}
                    interactive={false}
                  />
                </div>
              )}
            </div>
            {showDetails ? (
              <div
                id="resource-preview-details"
                className="max-h-40 shrink-0 space-y-3 overflow-y-auto border-t border-border bg-surface px-5 py-4"
              >
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
            ) : null}

            <DialogFooter className="mx-0 mb-0 shrink-0 flex-row rounded-t-none border-t border-border bg-transparent px-4 py-3">
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
