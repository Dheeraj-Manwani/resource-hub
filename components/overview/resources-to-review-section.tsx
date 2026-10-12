"use client"

import { LibraryBigIcon, StarIcon } from "lucide-react"
import { ResourceContextMenu } from "@/components/resources/resource-context-menu"
import { TypeIcon } from "@/components/resources/type-icon"
import { Button } from "@/components/ui/button"
import { useUpdateResource } from "@/hooks/queries/resources"
import { formatRelative } from "@/lib/format"
import type { OverviewSummary } from "@/lib/overview/model"
import { displayTitle, type ResourceDto } from "@/lib/resources/dto"
import type { OverviewSectionProps } from "./section-context"
import { pathFor, TOUCH_LINK, SectionHeader, PageLink } from "./section-ui"

export function OverviewResourceRow({
  resource,
  data,
  openResource,
  openPreview,
  mode = "review",
}: {
  resource: ResourceDto
  data: OverviewSummary
  openResource: (id: string) => void
  openPreview: (id: string) => void
  mode?: "review" | "favorite"
}) {
  const update = useUpdateResource()
  return (
    <ResourceContextMenu
      resource={resource}
      onEdit={openResource}
      onPreview={openPreview}
      buttonClassName="absolute top-3 right-0"
      trigger={
        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 pr-8" />
      }
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
        {resource.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resource.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <TypeIcon type={resource.type} className="size-4" />
        )}
      </span>
      <button
        type="button"
        className="min-h-11 min-w-0 flex-1 text-left hover:text-brand"
        onClick={() => openPreview(resource.id)}
      >
        <span className="block text-sm font-medium break-words">
          {displayTitle(resource)}
        </span>
        <span className="mt-1 block text-xs text-subtle">
          {resource.projects.length
            ? pathFor(data, resource.projects[0].id)
            : "Independent resource"}{" "}
          · Saved {formatRelative(resource.createdAt)}
        </span>
      </button>
      <div className="flex basis-full flex-wrap gap-x-3 pl-13 sm:basis-auto sm:pl-0">
        <button
          type="button"
          className={TOUCH_LINK}
          onClick={() => openPreview(resource.id)}
        >
          Preview
        </button>
        <Button
          variant="ghost"
          className="min-h-11 text-xs text-brand"
          loading={update.isPending}
          aria-label={
            mode === "favorite"
              ? `Remove ${displayTitle(resource)} from favorites`
              : undefined
          }
          onClick={() =>
            update.mutate({
              id: resource.id,
              patch:
                mode === "favorite"
                  ? { isFavorite: false }
                  : { isReviewed: true },
            })
          }
        >
          {mode === "favorite" ? (
            <>
              <StarIcon className="fill-brand" /> Remove favorite
            </>
          ) : (
            "Mark reviewed"
          )}
        </Button>
      </div>
    </ResourceContextMenu>
  )
}

export function ResourcesToReviewSection({
  data,
  actions,
}: OverviewSectionProps) {
  const { resources } = data
  const { openResource, openPreview, openAddResource } = actions
  return (
    <section
      id="overview-resources"
      className="scroll-mt-24"
      aria-label="Resources to review"
    >
      <SectionHeader title="Saved to revisit">
        <PageLink href="/resources?reviewed=false">Not reviewed yet</PageLink>
      </SectionHeader>
      {resources.toReview.length ? (
        resources.toReview.map((resource) => (
          <OverviewResourceRow
            key={resource.id}
            resource={resource}
            data={data}
            openResource={openResource}
            openPreview={openPreview}
          />
        ))
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-b border-border py-5">
          <LibraryBigIcon className="size-4 text-subtle" />
          <p className="text-sm text-text-muted">
            {resources.total
              ? "Your saved resources are reviewed."
              : "Save a useful link, a thought, or a file."}
          </p>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => openAddResource()}
          >
            Save resource
          </Button>
        </div>
      )}
    </section>
  )
}
