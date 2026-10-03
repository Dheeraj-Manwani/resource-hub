"use client"

import { CheckIcon, CopyIcon, DownloadIcon, FileTextIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle, formatBytes, hostname } from "@/lib/resources/dto"

import { InstagramEmbed } from "../embeds/instagram-embed"
import { ResourceImage } from "../embeds/resource-image"
import { XEmbed } from "../embeds/x-embed"
import { YoutubePlayer } from "../embeds/youtube-player"
import { XMark } from "../type-icon"

import { CardText, MetaLine } from "./card-parts"

export function aspectOf(resource: ResourceDto, fallback?: number) {
  const { imageWidth, imageHeight } = resource.metadata
  if (imageWidth && imageHeight)
    return Math.min(Math.max(imageWidth / imageHeight, 0.5), 2.4)
  return fallback
}

export function YoutubeCardBody({ resource }: { resource: ResourceDto }) {
  const yt = resource.metadata.youtube
  return (
    <>
      {yt ? (
        <YoutubePlayer
          videoId={yt.videoId}
          start={yt.start}
          isShort={yt.isShort}
          title={displayTitle(resource)}
          poster={resource.thumbnailUrl}
          durationSeconds={yt.durationSeconds}
        />
      ) : null}
      <CardText resource={resource} showDescription={false} />
    </>
  )
}

export function InstagramCardBody({ resource }: { resource: ResourceDto }) {
  return (
    <>
      <div className="p-2 pb-0">
        <InstagramEmbed resource={resource} />
      </div>
      <CardText resource={resource} clamp={2} />
    </>
  )
}

export function XCardBody({ resource }: { resource: ResourceDto }) {
  const [embed, setEmbed] = useState(false)
  const m = resource.metadata
  const text = m.x?.text ?? m.description ?? displayTitle(resource)
  if (embed) {
    return (
      <div className="p-2">
        <XEmbed resource={resource} />
      </div>
    )
  }
  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/10">
          <XMark className="size-3.5" />
        </span>
        <div className="min-w-0 text-sm leading-tight">
          <p className="truncate font-medium">{m.author ?? "Post on X"}</p>
          {m.x?.handle ? (
            <p className="truncate text-xs text-subtle">@{m.x.handle}</p>
          ) : null}
        </div>
      </div>
      <p className="line-clamp-[8] text-[15px] leading-relaxed whitespace-pre-line">
        {text}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-subtle">
          {formatDate(m.publishedAt ?? resource.createdAt)}
        </span>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setEmbed(true)}
          className="text-text-muted"
        >
          Show embed
        </Button>
      </div>
    </div>
  )
}

export function PinterestCardBody({ resource }: { resource: ResourceDto }) {
  return (
    <>
      <ResourceImage
        src={resource.thumbnailUrl}
        alt={displayTitle(resource)}
        type="pinterest"
        className="w-full"
        aspectRatio={aspectOf(resource, 2 / 3)}
      />
      <CardText resource={resource} clamp={2} />
    </>
  )
}

export function LinkCardBody({ resource }: { resource: ResourceDto }) {
  return (
    <>
      {resource.thumbnailUrl ? (
        <ResourceImage
          src={resource.thumbnailUrl}
          alt=""
          type="link"
          className="w-full"
          aspectRatio={aspectOf(resource, 1.91)}
        />
      ) : null}
      <CardText resource={resource} />
    </>
  )
}

export function ImageCardBody({
  resource,
  onOpenImage,
}: {
  resource: ResourceDto
  onOpenImage?: (id: string) => void
}) {
  const aspect =
    resource.file?.width && resource.file.height
      ? resource.file.width / resource.file.height
      : aspectOf(resource, 4 / 3)
  return (
    <>
      <button
        type="button"
        className="block w-full cursor-zoom-in"
        onClick={() => onOpenImage?.(resource.id)}
        aria-label={`View ${displayTitle(resource)}`}
      >
        <ResourceImage
          src={resource.thumbnailUrl ?? resource.file?.url}
          alt={displayTitle(resource)}
          type="image"
          className="w-full"
          aspectRatio={
            aspect ? Math.min(Math.max(aspect, 0.5), 2.4) : undefined
          }
        />
      </button>
      {resource.title ? (
        <p className="line-clamp-2 px-3 pt-2.5 pb-3 text-sm text-text-muted">
          {resource.title}
        </p>
      ) : null}
    </>
  )
}

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="xs"
      variant="ghost"
      className="text-text-muted"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("Clipboard access was blocked")
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </Button>
  )
}

export function NoteCardBody({ resource }: { resource: ResourceDto }) {
  const text = resource.bodyText ?? ""
  const firstLine = text.split("\n")[0] ?? ""
  const showTitle = resource.title && resource.title !== firstLine
  return (
    <div className="space-y-2 p-3">
      <MetaLine resource={resource} />
      {showTitle ? (
        <h3 className="text-[15px] leading-snug font-medium">
          {resource.title}
        </h3>
      ) : null}
      <p className="line-clamp-[10] text-sm leading-relaxed whitespace-pre-line text-text-muted">
        {text}
      </p>
      <div className="flex justify-end">
        <CopyButton text={text} />
      </div>
    </div>
  )
}

export function FileCardBody({ resource }: { resource: ResourceDto }) {
  const file = resource.file
  const name = file?.name ?? displayTitle(resource)
  const ext = name.includes(".")
    ? name.split(".").pop()!.toUpperCase().slice(0, 4)
    : "FILE"
  const href = file ? `${file.url}?download=1` : resource.url
  return (
    <div className="space-y-3 p-3">
      {resource.thumbnailUrl ? (
        <ResourceImage
          src={resource.thumbnailUrl}
          alt=""
          type="file"
          className="w-full rounded-md"
          aspectRatio={aspectOf(resource, 4 / 3)}
        />
      ) : null}
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-10 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-300">
          <FileTextIcon className="size-5" />
          <span className="absolute -bottom-1.5 rounded bg-violet-500 px-1 text-[9px] font-bold text-white">
            {ext}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {resource.title ?? name}
          </p>
          <p className="truncate text-xs text-subtle">
            {file
              ? `${formatBytes(file.size)} · ${file.mime}`
              : (hostname(resource.url) ?? "File")}
          </p>
        </div>
        {href ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Download"
            nativeButton={false}
            render={<a href={href} target="_blank" rel="noopener noreferrer" />}
          >
            <DownloadIcon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
