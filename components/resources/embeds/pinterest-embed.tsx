"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { useMediaController } from "@/hooks/use-media-controller"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"

import { PinterestMark } from "../type-icon"

import { ResourceImage } from "./resource-image"

/** Image-forward snapshot with an optional click-to-load official embed. */
export function PinterestEmbed({ resource }: { resource: ResourceDto }) {
  const pinId = resource.metadata.pinterest?.pinId
  const [loaded, setLoaded] = useState(false)
  const { activate } = useMediaController({ reset: () => setLoaded(false) })
  const { imageWidth, imageHeight } = resource.metadata

  if (loaded && pinId) {
    return (
      <div data-interactive className="flex justify-center">
        <iframe
          src={`https://assets.pinterest.com/ext/embed.html?id=${encodeURIComponent(pinId)}`}
          title={displayTitle(resource)}
          className="h-[620px] w-full max-w-[345px] rounded-lg"
          loading="lazy"
        />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <ResourceImage
        src={resource.thumbnailUrl}
        alt={displayTitle(resource)}
        type="pinterest"
        className="w-full rounded-lg"
        fit="contain"
        aspectRatio={
          imageWidth && imageHeight ? imageWidth / imageHeight : undefined
        }
      />
      {pinId ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLoaded(true)
            activate()
          }}
        >
          <PinterestMark className="size-3.5 text-[#ff3b52]" />
          Load Pinterest embed
        </Button>
      ) : null}
    </div>
  )
}
