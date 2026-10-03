"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { useUpdateResource } from "@/hooks/queries/resources"
import { useInView } from "@/hooks/use-in-view"
import { useMediaController } from "@/hooks/use-media-controller"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

import { InstagramMark } from "../type-icon"

import { ResourceImage } from "./resource-image"
import { SnapshotFallback } from "./snapshot-fallback"

const LOAD_TIMEOUT_MS = 12_000

/**
 * Click-to-load Instagram embed. A cross-origin iframe can't reliably say
 * "this post is private/deleted", so we combine a load timeout with a manual
 * "Embed not working" toggle that falls back to the snapshot.
 */
export function InstagramEmbed({
  resource,
  autoLoad = false,
  className,
}: {
  resource: ResourceDto
  autoLoad?: boolean
  className?: string
}) {
  const ig = resource.metadata.instagram
  const [loaded, setLoaded] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [height, setHeight] = useState(560)
  const [forceEmbed, setForceEmbed] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const update = useUpdateResource()

  const media = useMediaController({
    reset: () => {
      setLoaded(false)
      setFrameReady(false)
    },
  })
  const { activate } = media
  const { ref, inView } = useInView<HTMLDivElement>({
    rootMargin: "1200px",
    onChange: (visible) => {
      if (!visible) {
        setLoaded(false)
        setFrameReady(false)
      }
    },
  })

  const shouldLoad = loaded || (autoLoad && inView && !timedOut)

  useEffect(() => {
    if (!shouldLoad || frameReady) return
    const timer = window.setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [shouldLoad, frameReady])

  // Instagram's embed posts its content height.
  useEffect(() => {
    if (!shouldLoad) return
    function onMessage(event: MessageEvent) {
      if (
        event.origin !== "https://www.instagram.com" ||
        event.source !== iframeRef.current?.contentWindow
      )
        return
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (
          data?.type === "MEASURE" &&
          typeof data.details?.height === "number"
        ) {
          setHeight(Math.min(Math.max(data.details.height, 300), 1400))
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [shouldLoad])

  if (!ig)
    return (
      <SnapshotFallback resource={resource} note="Not an Instagram post URL." />
    )

  const unavailable =
    (resource.embedStatus === "unavailable" || timedOut) && !forceEmbed
  if (unavailable) {
    return (
      <SnapshotFallback
        resource={resource}
        onRetry={() => {
          setTimedOut(false)
          setForceEmbed(true)
          setLoaded(true)
          activate()
        }}
      />
    )
  }

  const title = displayTitle(resource)
  return (
    <div
      ref={ref}
      data-interactive
      className={cn("relative w-full", className)}
    >
      {shouldLoad ? (
        <div className="overflow-hidden rounded-lg bg-white">
          <iframe
            ref={iframeRef}
            src={`https://www.instagram.com/${ig.kind}/${encodeURIComponent(ig.shortcode)}/embed/captioned/`}
            title={title}
            className="block w-full"
            style={{ height }}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
            onLoad={() => setFrameReady(true)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setLoaded(true)
            activate()
          }}
          className="group/ig relative block w-full overflow-hidden rounded-lg"
          aria-label={`Load Instagram post: ${title}`}
        >
          <ResourceImage
            src={resource.thumbnailUrl}
            alt=""
            type="instagram"
            className="w-full"
            aspectRatio={
              resource.metadata.imageWidth && resource.metadata.imageHeight
                ? resource.metadata.imageWidth / resource.metadata.imageHeight
                : resource.thumbnailUrl
                  ? 4 / 5
                  : 1
            }
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover/ig:bg-black/15">
            <span className="flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur group-hover/ig:bg-brand group-hover/ig:text-brand-fg">
              <InstagramMark className="size-3.5" />
              {ig.kind === "reel" ? "Play reel" : "Load post"}
            </span>
          </span>
        </button>
      )}
      {shouldLoad ? (
        <div className="mt-1.5 flex justify-end">
          <Button
            size="xs"
            variant="ghost"
            className="text-subtle"
            onClick={() => {
              setForceEmbed(false)
              update.mutate({
                id: resource.id,
                patch: { embedStatus: "unavailable" },
              })
            }}
          >
            Embed not working?
          </Button>
        </div>
      ) : null}
    </div>
  )
}
