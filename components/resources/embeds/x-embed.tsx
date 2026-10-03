"use client"

import { Loader2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useMediaController } from "@/hooks/use-media-controller"
import type { ResourceDto } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

import { loadScript } from "./load-script"
import { SnapshotFallback } from "./snapshot-fallback"

type Twttr = {
  widgets: {
    createTweet: (
      id: string,
      el: HTMLElement,
      options: Record<string, unknown>
    ) => Promise<HTMLElement | undefined>
  }
}

/** Official widgets.js embed (dark theme); the snapshot is the fallback. */
export function XEmbed({
  resource,
  className,
}: {
  resource: ResourceDto
  className?: string
}) {
  const statusId = resource.metadata.x?.statusId
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading")
  const [generation, setGeneration] = useState(0)
  // Videos inside the embed can't be paused programmatically: re-render it.
  useMediaController({ reset: () => setGeneration((g) => g + 1) })

  useEffect(() => {
    const el = containerRef.current
    if (!statusId || !el) return
    let cancelled = false
    el.innerHTML = ""
    loadScript("https://platform.twitter.com/widgets.js")
      .then(() => {
        const twttr = (window as unknown as { twttr?: Twttr }).twttr
        if (!twttr) throw new Error("widgets.js unavailable")
        return twttr.widgets.createTweet(statusId, el, {
          theme: "dark",
          dnt: true,
          conversation: "none",
          align: "center",
        })
      })
      .then((node) => {
        if (!cancelled) setState(node ? "ready" : "failed")
      })
      .catch(() => {
        if (!cancelled) setState("failed")
      })
    return () => {
      cancelled = true
    }
  }, [statusId, generation])

  if (!statusId || state === "failed") {
    return (
      <SnapshotFallback
        resource={resource}
        note="Couldn't load the post from X — showing the saved snapshot."
      />
    )
  }
  return (
    <div data-interactive className={cn("relative min-h-24", className)}>
      {state === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center text-subtle">
          <Loader2Icon className="size-5 animate-spin" />
        </div>
      ) : null}
      <div ref={containerRef} className="[&_.twitter-tweet]:!my-0" />
    </div>
  )
}
