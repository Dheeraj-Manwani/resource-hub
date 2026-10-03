"use client"

import { ExternalLinkIcon, PanelRightOpenIcon, StarIcon } from "lucide-react"
import { memo } from "react"

import { Button } from "@/components/ui/button"
import { useUpdateResource } from "@/hooks/queries/resources"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

import { MetadataStatusNote, TagChips } from "./cards/card-parts"
import { GithubCardBody } from "./cards/github-card"
import {
  FileCardBody,
  ImageCardBody,
  InstagramCardBody,
  LinkCardBody,
  NoteCardBody,
  PinterestCardBody,
  XCardBody,
  YoutubeCardBody,
} from "./cards/type-cards"
import { TypeBadge } from "./type-icon"

type CardProps = {
  resource: ResourceDto
  onOpen: (id: string) => void
  onOpenImage?: (id: string) => void
}

function CardBody({ resource, onOpenImage }: Omit<CardProps, "onOpen">) {
  switch (resource.type) {
    case "youtube":
      return <YoutubeCardBody resource={resource} />
    case "instagram":
      return <InstagramCardBody resource={resource} />
    case "x":
      return <XCardBody resource={resource} />
    case "github":
      return <GithubCardBody resource={resource} />
    case "pinterest":
      return <PinterestCardBody resource={resource} />
    case "image":
      return <ImageCardBody resource={resource} onOpenImage={onOpenImage} />
    case "note":
      return <NoteCardBody resource={resource} />
    case "file":
      return <FileCardBody resource={resource} />
    default:
      return <LinkCardBody resource={resource} />
  }
}

const INTERACTIVE =
  "a,button,input,textarea,iframe,[data-interactive],[role=menu]"

export const ResourceCard = memo(function ResourceCard({
  resource,
  onOpen,
  onOpenImage,
}: CardProps) {
  const update = useUpdateResource()
  const title = displayTitle(resource)

  return (
    <article
      tabIndex={0}
      aria-label={title}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return
        onOpen(resource.id)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget)
          onOpen(resource.id)
      }}
      className="group/card relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-card transition-[border-color,box-shadow,transform] duration-200 ease-out-soft hover:border-brand/40 hover:shadow-[0_0_0_1px_rgb(255_106_0/0.15),0_8px_28px_rgb(0_0_0/0.45)] focus-visible:shadow-glow focus-visible:outline-none"
    >
      <CardBody resource={resource} onOpenImage={onOpenImage} />

      {resource.tags.length || resource.metadataStatus !== "ok" ? (
        <div className="space-y-2 px-3 pb-3">
          <MetadataStatusNote resource={resource} />
          <TagChips tags={resource.tags} />
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-2 left-2">
        <TypeBadge
          type={resource.type}
          className="opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100"
        />
      </div>
      <div
        className={cn(
          "absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100",
          resource.isFavorite && "opacity-100"
        )}
      >
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label={
            resource.isFavorite ? "Remove from favorites" : "Add to favorites"
          }
          aria-pressed={resource.isFavorite}
          className="bg-black/70 backdrop-blur hover:bg-black/90"
          onClick={() =>
            update.mutate({
              id: resource.id,
              patch: { isFavorite: !resource.isFavorite },
            })
          }
        >
          <StarIcon
            className={cn(resource.isFavorite && "fill-brand text-brand")}
          />
        </Button>
        {resource.url ? (
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label="Open original"
            className="hidden bg-black/70 backdrop-blur group-hover/card:inline-flex hover:bg-black/90"
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
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label="Open details"
          className="hidden bg-black/70 backdrop-blur group-hover/card:inline-flex hover:bg-black/90"
          onClick={() => onOpen(resource.id)}
        >
          <PanelRightOpenIcon />
        </Button>
      </div>
    </article>
  )
})
