import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"

import { ResourceImage } from "./resource-image"

/** Shown when a platform embed is unavailable (private, deleted, blocked). */
export function SnapshotFallback({
  resource,
  note = "Embed unavailable — showing the saved snapshot.",
  onRetry,
}: {
  resource: ResourceDto
  note?: string
  onRetry?: () => void
}) {
  const title = displayTitle(resource)
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {resource.thumbnailUrl ? (
        <ResourceImage
          src={resource.thumbnailUrl}
          alt=""
          type={resource.type}
          className="max-h-[420px] w-full"
          fit="contain"
        />
      ) : null}
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-1.5 text-xs text-amber-400">
          <TriangleAlertIcon className="size-3.5" />
          {note}
        </p>
        <p className="text-sm font-medium">{title}</p>
        {resource.metadata.description &&
        resource.metadata.description !== title ? (
          <p className="line-clamp-6 text-sm whitespace-pre-line text-text-muted">
            {resource.metadata.description}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {resource.url ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLinkIcon />
              Open original
            </Button>
          ) : null}
          {onRetry ? (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Try embed again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
