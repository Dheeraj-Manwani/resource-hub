"use client"

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
}: {
  src: string | null | undefined
  alt: string
  type: ResourceType
  className?: string
  imgClassName?: string
  aspectRatio?: number
  fit?: "cover" | "contain"
  placeholderClassName?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = !src || failedSrc === src
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
          <TypeIcon type={type} className="size-7 opacity-70" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className={cn(
            "block h-full w-full",
            fit === "cover" ? "object-cover" : "object-contain",
            imgClassName
          )}
        />
      )}
    </div>
  )
}
