"use client"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/query-feedback"

import { useState } from "react"

import type { ResourceType } from "@/lib/resources/types"
import { cn } from "@/lib/utils"

import { TypeIcon } from "../type-icon"

/**
 * Image with a graceful placeholder. Remote snapshot images and our signed
 * `/api/files/:id` redirects are both plain <img> (next/image can't
 * optimize arbitrary hosts or authenticated redirects).
 */
export function ResourceImage({
  src,
  alt,
  type,
  className,
  imgClassName,
  aspectRatio,
  fit = "cover",
  placeholderClassName = "min-h-24",
  recovery = false,
  onOpen,
}: {
  src: string | null | undefined
  alt: string
  type: ResourceType
  className?: string
  imgClassName?: string
  aspectRatio?: number
  fit?: "cover" | "contain"
  placeholderClassName?: string
  recovery?: boolean
  onOpen?: () => void
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const failed = !src || failedSrc === src
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${src}:${attempt}`}
      src={src ?? undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setLoadedSrc(src ?? null)}
      onError={() => setFailedSrc(src ?? null)}
      className={cn(
        "block h-full w-full",
        fit === "cover" ? "object-cover" : "object-contain",
        imgClassName
      )}
    />
  )
  return (
    <div
      className={cn("relative overflow-hidden bg-surface-raised", className)}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {failed ? (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgb(255_106_0/0.12),transparent_60%)]",
            placeholderClassName
          )}
        >
          <div className="flex flex-col items-center gap-2">
            <TypeIcon type={type} className="size-7 opacity-70" />
            {src && recovery ? (
              <>
                <p role="alert" className="text-xs text-text-muted">
                  Image unavailable.
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setLoadedSrc(null)
                    setFailedSrc(null)
                    setAttempt((value) => value + 1)
                  }}
                >
                  Retry image
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {onOpen ? (
            <button
              type="button"
              className="block h-full w-full cursor-zoom-in"
              onClick={onOpen}
              aria-label="Open image viewer"
            >
              {image}
            </button>
          ) : (
            image
          )}
          {recovery && loadedSrc !== src ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <LoadingState label="Loading image…" />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
