"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import {
  formatTimer,
  isActiveTimer,
  timerElapsed,
  timerPhaseRemaining,
} from "@/lib/habits/timer"
import { useHabitTimer } from "./habit-timer-provider"

const subscribeNoop = () => () => {}
const WIDTH = 240
const HEIGHT = 104
type Resource = {
  sessionId: string
  video: HTMLVideoElement
  draw: () => void
  release: () => void
}

export function useMinimalTimerPip() {
  const timer = useHabitTimer()
  const latest = useRef({ timer, clockOffset: 0 })
  const resource = useRef<Resource | null>(null)
  const mounted = useRef(false)
  const [active, setActive] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState("")
  const supported = useSyncExternalStore(
    subscribeNoop,
    () =>
      window.isSecureContext &&
      document.pictureInPictureEnabled &&
      typeof HTMLVideoElement.prototype.requestPictureInPicture ===
        "function" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function",
    () => false
  )

  useEffect(() => {
    latest.current = { timer, clockOffset: timer.now - Date.now() }
    const current = resource.current
    if (!current) return
    if (
      timer.session?.id !== current.sessionId ||
      !isActiveTimer(timer.session.status)
    ) {
      if (document.pictureInPictureElement === current.video)
        void document.exitPictureInPicture().catch(() => {})
      current.release()
    } else current.draw()
  }, [timer])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const current = resource.current
      if (current && document.pictureInPictureElement === current.video)
        void document.exitPictureInPicture().catch(() => {})
      current?.release()
    }
  }, [])

  async function close() {
    const current = resource.current
    if (!current) return
    try {
      if (document.pictureInPictureElement === current.video)
        await document.exitPictureInPicture()
      current.release()
    } catch {
      setError("Couldn't close PiP. Use its close button to return to the tab.")
    }
  }

  async function open() {
    if (resource.current) return
    const session = latest.current.timer.session
    if (!session || !isActiveTimer(session.status) || !supported) return
    setError("")
    setOpening(true)
    const canvas = document.createElement("canvas")
    // A compact logical layout, rendered at 2x for sharp text when resized.
    canvas.width = WIDTH * 2
    canvas.height = HEIGHT * 2
    canvas.hidden = true
    canvas.dataset.habitTimerPip = "minimal"
    const drawingContext = canvas.getContext("2d", { alpha: false })
    if (!drawingContext) {
      setOpening(false)
      setError("Minimal PiP couldn't open. Your timer stays in the tab.")
      return
    }
    const context = drawingContext
    const sessionId = session.id
    context.scale(2, 2)
    const video = document.createElement("video")
    video.hidden = true
    video.muted = true
    video.playsInline = true
    video.dataset.habitTimerPip = "minimal"
    let stream: MediaStream | undefined
    let clock: Worker | undefined
    let startupTimeout: number | undefined
    let released = false
    let mediaAttached = false
    const media = navigator.mediaSession
    const previousMetadata = media?.metadata
    const previousPlayback = media?.playbackState

    function mediaAction(
      action: MediaSessionAction,
      handler: (() => void) | null
    ) {
      try {
        media?.setActionHandler(action, handler)
      } catch {
        // Native controls are optional; the tab always retains full controls.
      }
    }
    function draw() {
      const { timer: current, clockOffset } = latest.current
      const running = current.session
      if (!running || running.id !== sessionId) return
      const now = Date.now() + clockOffset
      const remaining = timerPhaseRemaining(running, now)
      const time = formatTimer(
        running.mode === "stopwatch" ? timerElapsed(running, now) : remaining
      )
      context.fillStyle = "#101010"
      context.fillRect(0, 0, WIDTH, HEIGHT)
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.font = "500 11px system-ui, sans-serif"
      context.fillStyle = "#b8b8b8"
      const characters = Array.from(`${running.icon} ${running.name}`)
      let name = characters.join("")
      while (
        context.measureText(name).width > WIDTH - 24 &&
        characters.length > 1
      ) {
        characters.pop()
        name = characters.join("") + "…"
      }
      context.fillText(name, WIDTH / 2, 22)
      context.font = "500 24px ui-monospace, Consolas, monospace"
      context.fillStyle = "#f5f5f5"
      context.fillText(time, WIDTH / 2, 57)
      const status = current.conflict
        ? "Check timer in tab"
        : running.status === "review"
          ? "Review in tab"
          : remaining <= 0
            ? "Time's up"
            : running.status === "paused"
              ? "Paused"
              : running.pomodoro
                ? `${running.pomodoro.phase === "break" ? "Break" : "Work"} · ${running.pomodoro.round}/${running.pomodoro.rounds}`
                : ""
      if (status) {
        context.font = "400 9px system-ui, sans-serif"
        context.fillStyle = "#f97316"
        context.fillText(status, WIDTH / 2, 86)
      }
      if (mediaAttached && media)
        media.playbackState =
          running.status === "running" && remaining > 0 ? "playing" : "paused"
      const track = stream?.getVideoTracks()[0] as
        CanvasCaptureMediaStreamTrack | undefined
      track?.requestFrame?.()
    }
    function release() {
      if (released) return
      released = true
      if (startupTimeout !== undefined) window.clearTimeout(startupTimeout)
      clock?.terminate()
      document.removeEventListener("visibilitychange", draw)
      window.removeEventListener("pagehide", release)
      video.removeEventListener("leavepictureinpicture", release)
      stream?.getTracks().forEach((track) => track.stop())
      video.pause()
      video.srcObject = null
      video.remove()
      canvas.remove()
      if (mediaAttached && media) {
        mediaAction("play", null)
        mediaAction("pause", null)
        media.metadata = previousMetadata ?? null
        media.playbackState = previousPlayback ?? "none"
      }
      if (resource.current?.video === video) {
        resource.current = null
        if (mounted.current) {
          setActive(false)
          setOpening(false)
        }
      }
    }
    resource.current = { sessionId: session.id, video, draw, release }
    try {
      document.body.append(canvas, video)
      stream = canvas.captureStream(1)
      video.srcObject = stream
      draw()
      // A worker wakes the renderer even when the tab's timers are throttled.
      // Each frame uses authoritative timestamps, never the video's clock.
      clock = new Worker(
        new URL("./timer-pip-clock.worker.ts", import.meta.url)
      )
      clock.onmessage = draw
      clock.onerror = () => {
        if (document.pictureInPictureElement === video)
          void document.exitPictureInPicture().catch(() => {})
        release()
        if (mounted.current)
          setError(
            "Minimal PiP couldn't keep updating. Your timer stays in the tab."
          )
      }
      document.addEventListener("visibilitychange", draw)
      window.addEventListener("pagehide", release)
      video.addEventListener("leavepictureinpicture", release)
      await Promise.race([
        video.play(),
        new Promise<never>((_, reject) => {
          startupTimeout = window.setTimeout(
            () => reject(new Error("PiP video didn't become ready")),
            10000
          )
        }),
      ])
      window.clearTimeout(startupTimeout)
      if (released) return
      await video.requestPictureInPicture()
      if (released) {
        if (document.pictureInPictureElement === video)
          await document.exitPictureInPicture()
        return
      }
      if (media && typeof MediaMetadata !== "undefined") {
        mediaAttached = true
        media.metadata = new MediaMetadata({ title: session.name })
        mediaAction("pause", () => {
          const current = latest.current.timer
          if (
            !current.conflict &&
            current.session?.id === sessionId &&
            current.session.status === "running"
          )
            current.command({ action: "pause" })
        })
        mediaAction("play", () => {
          const current = latest.current.timer
          const state = current.session
          if (
            state &&
            state.id === sessionId &&
            !current.conflict &&
            (state.status === "paused" || state.status === "review") &&
            timerPhaseRemaining(
              state,
              Date.now() + latest.current.clockOffset
            ) > 0
          )
            current.command({ action: "resume" })
        })
      }
      draw()
      setActive(true)
      setOpening(false)
    } catch {
      release()
      if (mounted.current)
        setError("Minimal PiP couldn't open. Your timer stays in the tab.")
    }
  }

  return { active, opening, supported, error, open, close }
}
