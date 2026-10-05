"use client"

import { PlayIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useInView } from "@/hooks/use-in-view"
import { useMediaController } from "@/hooks/use-media-controller"
import { cn } from "@/lib/utils"

import { ResourceImage } from "./resource-image"

const YT_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://www.youtube.com",
]

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = h ? String(m).padStart(2, "0") : String(m)
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

/**
 * Facade (poster + play button) → youtube-nocookie iframe with the IFrame
 * API enabled, so another player starting can pause this one.
 */
export function YoutubePlayer({
  videoId,
  start,
  title,
  poster,
  isShort,
  durationSeconds,
  className,
}: {
  videoId: string
  start?: number
  title: string
  poster?: string | null
  isShort?: boolean
  durationSeconds?: number
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const command = (func: string) =>
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      "*"
    )

  const media = useMediaController({
    pause: () => {
      command("pauseVideo")
      if (!inView) setLoaded(false)
    },
  })
  const { activate, deactivate } = media
  // Far off-screen players go back to their poster.
  const { ref, inView } = useInView<HTMLDivElement>({
    rootMargin: "1200px",
    onChange: (visible) => {
      if (!visible && !media.isActive) setLoaded(false)
    },
  })

  // Learn when the user (re)starts playback inside the iframe.
  useEffect(() => {
    if (!loaded) return
    function onMessage(event: MessageEvent) {
      if (
        !YT_ORIGINS.includes(event.origin) ||
        event.source !== iframeRef.current?.contentWindow
      )
        return
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data
        const state =
          data?.event === "infoDelivery"
            ? data.info?.playerState
            : data?.event === "onStateChange"
              ? data.info
              : undefined
        if (state === 1) activate()
        else if (state === 0 || state === 2) {
          deactivate()
          if (!inView) setLoaded(false)
        }
      } catch {
        // not a player message
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [loaded, activate, deactivate, inView])

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&enablejsapi=1&rel=0&playsinline=1&origin=${encodeURIComponent(origin)}${start ? `&start=${start}` : ""}`

  return (
    <div
      ref={ref}
      data-interactive
      className={cn("relative w-full overflow-hidden bg-black", className)}
      style={{ aspectRatio: isShort ? 9 / 16 : 16 / 9 }}
    >
      {loaded ? (
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() =>
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({
                event: "listening",
                id: media.id,
                channel: "widget",
              }),
              "*"
            )
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setLoaded(true)
            media.activate()
          }}
          className="group/play absolute inset-0 flex items-center justify-center"
          aria-label={`Play ${title}`}
        >
          <ResourceImage
            src={poster ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            type="youtube"
            className="absolute inset-0 h-full w-full"
          />
          <span className="absolute inset-0 bg-black/20 transition-colors group-hover/play:bg-black/10" />
          <span className="relative flex size-14 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20 backdrop-blur transition-all group-hover/play:scale-105 group-hover/play:bg-brand group-hover/play:text-brand-fg group-hover/play:shadow-glow">
            <PlayIcon className="ml-0.5 size-6 fill-current" />
          </span>
          {durationSeconds ? (
            <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] text-white">
              {formatDuration(durationSeconds)}
            </span>
          ) : null}
        </button>
      )}
    </div>
  )
}
