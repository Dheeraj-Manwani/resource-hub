"use client"

import {
  BookOpenIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useReadme, useUpdateResource } from "@/hooks/queries/resources"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"

import { aspectOf, CopyButton } from "../cards/type-cards"
import { GithubCardBody } from "../cards/github-card"
import { InstagramEmbed } from "../embeds/instagram-embed"
import { PinterestEmbed } from "../embeds/pinterest-embed"
import { ResourceImage } from "../embeds/resource-image"
import { XEmbed } from "../embeds/x-embed"
import { YoutubePlayer } from "../embeds/youtube-player"

const NoteEditor = dynamic(() => import("./note-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
})

function OpenOriginal({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <Button
      size="sm"
      variant="outline"
      nativeButton={false}
      render={<a href={url} target="_blank" rel="noopener noreferrer" />}
    >
      <ExternalLinkIcon />
      Open original
    </Button>
  )
}

function GithubFullView({ resource }: { resource: ResourceDto }) {
  const isRepo = resource.metadata.github?.kind === "repo"
  const [showReadme, setShowReadme] = useState(false)
  const readme = useReadme(resource.id, isRepo && showReadme)
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-surface">
        <GithubCardBody resource={resource} />
      </div>
      {isRepo ? (
        showReadme ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            {readme.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : readme.isError ? (
              <p className="text-sm text-text-muted">
                Couldn&apos;t load the README ({readme.error.message}).
              </p>
            ) : (
              // HTML is sanitized on the server (sanitize-html allowlist).
              <div
                className="prose-dark"
                dangerouslySetInnerHTML={{ __html: readme.data.html }}
              />
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowReadme(true)}
          >
            <BookOpenIcon />
            Show README
          </Button>
        )
      ) : null}
    </div>
  )
}

function FileFullView({ resource }: { resource: ResourceDto }) {
  const file = resource.file
  const src = file?.url ?? resource.url
  const mime =
    file?.mime ??
    (resource.url?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "")
  const [loading, setLoading] = useState(true)
  if (src && mime === "application/pdf") {
    return (
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-subtle">
            <Loader2Icon className="size-5 animate-spin" />
          </div>
        ) : null}
        <iframe
          src={src}
          title={displayTitle(resource)}
          className="h-[70vh] w-full"
          onLoad={() => setLoading(false)}
        />
      </div>
    )
  }
  if (src && mime.startsWith("video/") && file) {
    return (
      <video
        src={src}
        controls
        className="w-full rounded-lg bg-black"
        preload="metadata"
      />
    )
  }
  if (src && mime.startsWith("audio/") && file) {
    return <audio src={src} controls className="w-full" preload="metadata" />
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="flex-1 text-sm text-text-muted">
        No inline preview for this file type.
      </p>
      {src ? (
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<a href={src} target="_blank" rel="noopener noreferrer" />}
        >
          <ExternalLinkIcon />
          Open in new tab
        </Button>
      ) : null}
      {file ? (
        <Button
          size="sm"
          nativeButton={false}
          render={
            <a href={file.downloadUrl} target="_blank" rel="noopener noreferrer" />
          }
        >
          <DownloadIcon />
          Download
        </Button>
      ) : null}
    </div>
  )
}

/** Large, playable/readable rendering of a resource (drawer + focus view). */
export function ResourceFullView({
  resource,
  onOpenImage,
}: {
  resource: ResourceDto
  onOpenImage?: (id: string) => void
}) {
  const update = useUpdateResource()
  const title = displayTitle(resource)
  const m = resource.metadata

  switch (resource.type) {
    case "youtube":
      return m.youtube ? (
        <YoutubePlayer
          videoId={m.youtube.videoId}
          start={m.youtube.start}
          isShort={m.youtube.isShort}
          title={title}
          poster={resource.thumbnailUrl}
          durationSeconds={m.youtube.durationSeconds}
          className={
            m.youtube.isShort ? "mx-auto max-w-xs rounded-lg" : "rounded-lg"
          }
        />
      ) : null
    case "instagram":
      return (
        <div className="mx-auto max-w-[480px]">
          <InstagramEmbed resource={resource} autoLoad />
        </div>
      )
    case "x":
      return (
        <div className="mx-auto max-w-[550px]">
          <XEmbed resource={resource} />
        </div>
      )
    case "github":
      return <GithubFullView resource={resource} />
    case "pinterest":
      return <PinterestEmbed resource={resource} />
    case "image": {
      const src = resource.file?.url ?? resource.thumbnailUrl
      return (
        <button
          type="button"
          className="block w-full cursor-zoom-in"
          onClick={() => onOpenImage?.(resource.id)}
          aria-label="Open image viewer"
        >
          <ResourceImage
            src={src}
            alt={title}
            type="image"
            className="max-h-[70vh] w-full rounded-lg"
            fit="contain"
          />
        </button>
      )
    }
    case "note":
      return (
        <div className="space-y-2">
          <NoteEditor
            content={resource.bodyJson}
            onSave={(doc, text) =>
              update.mutate({
                id: resource.id,
                patch: { bodyJson: doc, bodyText: text },
              })
            }
          />
          <div className="flex justify-end">
            <CopyButton text={resource.bodyText ?? ""} label="Copy text" />
          </div>
        </div>
      )
    case "file":
      return <FileFullView resource={resource} />
    default:
      return (
        <div className="space-y-3">
          {resource.thumbnailUrl ? (
            <ResourceImage
              src={resource.thumbnailUrl}
              alt=""
              type="link"
              className="w-full rounded-lg"
              aspectRatio={aspectOf(resource, 1.91)}
            />
          ) : null}
          {m.description ? (
            <p className="text-sm leading-relaxed text-text-muted">
              {m.description}
            </p>
          ) : null}
          <OpenOriginal url={resource.url} />
        </div>
      )
  }
}
