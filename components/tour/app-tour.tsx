"use client"

import { XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import { useSettings, useUpdateSettings } from "@/hooks/queries/settings"
import { cn } from "@/lib/utils"

type Step = {
  target: string
  title: string
  body: string
  /** Whether this step's target lives in the sidebar, which is tucked
   * behind the hamburger menu on mobile. */
  inSidebar?: boolean
}

const STEPS: Step[] = [
  {
    target: "tour-projects",
    title: "Projects",
    body: "Start here: group related resources and tasks into a project, and nest sub-projects underneath for deeper structure.",
    inSidebar: true,
  },
  {
    target: "tour-nav-overview",
    title: "Overview",
    body: "Your home base — what's due today, what you just saved, and what's moving.",
    inSidebar: true,
  },
  {
    target: "tour-nav-resources",
    title: "Resources",
    body: "Paste a YouTube, GitHub or Pinterest link, any URL, a quick note, or drop a file. It shows up rendered and playable, not just a bookmark.",
    inSidebar: true,
  },
  {
    target: "tour-nav-tasks",
    title: "Tasks",
    body: "Turn any resource into a task with a due date, priority and checklist — or create one from scratch.",
    inSidebar: true,
  },
  {
    target: "tour-nav-calendar",
    title: "Calendar",
    body: "See everything that's due, laid out day by day.",
    inSidebar: true,
  },
  {
    target: "tour-nav-quick-notes",
    title: "Quick Notes",
    body: "A scratchpad for loose ideas — jot things down now, shape them into a resource or task later.",
    inSidebar: true,
  },
  {
    target: "tour-nav-tags",
    title: "Tags",
    body: "Tag anything to cross-reference it later, independent of which project it's filed under.",
    inSidebar: true,
  },
  {
    target: "tour-nav-search",
    title: "Search",
    body: "Full-text search across resources, tasks, projects and tags — or press ⌘K / Ctrl+K from anywhere.",
    inSidebar: true,
  },
  {
    target: "tour-add-menu",
    title: "Add anything",
    body: "One button to create a resource, task, project or quick note — reachable from anywhere in the app.",
  },
]

function isMobileViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
  )
}

function findVisibleTarget(name: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)
  for (const el of els) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

const CARD_WIDTH = 320
const GAP = 12
const PAD = 8

function cardPosition(rect: DOMRect | null): React.CSSProperties {
  if (!rect) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
  }
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Prefer below the target; fall back above if there isn't room.
  const spaceBelow = vh - rect.bottom
  const top = spaceBelow > 180 || rect.top < 180 ? rect.bottom + GAP : undefined
  const bottom = top === undefined ? vh - rect.top + GAP : undefined

  let left = rect.left + rect.width / 2 - CARD_WIDTH / 2
  left = Math.max(PAD, Math.min(left, vw - CARD_WIDTH - PAD))

  return {
    left,
    ...(top !== undefined ? { top } : { bottom }),
  }
}

export function AppTour() {
  const { tourOpen, openTour, closeTour, setMobileNavOpen } = useShell()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const [finishing, setFinishing] = useState<"done" | "skip" | null>(null)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const frameRef = useRef<number | null>(null)

  // Auto-open exactly once for a new user, as soon as we know they haven't
  // taken the tour.
  useEffect(() => {
    if (settings && !settings.hasSeenOnboarding) openTour()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasSeenOnboarding])

  // Reset to the first step whenever the tour transitions from closed to
  // open (adjusting state during render, so this doesn't cascade an effect).
  const [wasOpen, setWasOpen] = useState(tourOpen)
  if (tourOpen !== wasOpen) {
    setWasOpen(tourOpen)
    if (tourOpen) setStep(0)
  }

  const current = STEPS[step]

  // Measure (and re-measure) the current step's target, retrying across a
  // few frames since opening the mobile nav sheet needs a tick to mount.
  useEffect(() => {
    if (!tourOpen || !current) return

    if (isMobileViewport()) setMobileNavOpen(!!current.inSidebar)

    // Keep sampling for a fixed number of frames rather than stopping at
    // the first hit — opening the mobile nav sheet animates in, so an
    // early measurement would lock onto a mid-transition position.
    let frame = 0
    const totalFrames = 20
    function measure() {
      const el = findVisibleTarget(current!.target)
      if (el) {
        if (frame === 0) el.scrollIntoView({ block: "nearest" })
        setRect(el.getBoundingClientRect())
      } else if (frame >= totalFrames) {
        setRect(null)
      }
      frame++
      if (frame <= totalFrames)
        frameRef.current = requestAnimationFrame(measure)
    }
    measure()
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, step])

  useEffect(() => {
    if (!tourOpen || !current) return
    function reposition() {
      const el = findVisibleTarget(current!.target)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true)
    return () => {
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, step])

  useEffect(() => {
    if (!tourOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish()
      if (e.key === "ArrowRight") next()
      if (e.key === "ArrowLeft") back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, step])

  function finish(action: "done" | "skip" = "skip") {
    if (finishing) return
    const close = () => {
      setMobileNavOpen(false)
      closeTour()
      setFinishing(null)
    }
    if (settings && !settings.hasSeenOnboarding) {
      setFinishing(action)
      updateSettings.mutate(
        { hasSeenOnboarding: true },
        {
          onSuccess: close,
          onError: () => setFinishing(null),
        }
      )
    } else close()
  }

  function next() {
    if (step === STEPS.length - 1) finish("done")
    else setStep((s) => s + 1)
  }

  function back() {
    setStep((s) => Math.max(0, s - 1))
  }

  if (!tourOpen || !current) return null

  const last = step === STEPS.length - 1
  const padded = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Close tour"
        onClick={() => finish()}
        className={cn(
          "fixed inset-0 cursor-default transition-colors",
          !padded && "bg-black/70"
        )}
      />
      {padded ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl transition-all duration-200"
          style={{
            top: padded.top,
            left: padded.left,
            width: padded.width,
            height: padded.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.7)",
          }}
        />
      ) : null}
      {padded ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-2 ring-brand transition-all duration-200"
          style={{
            top: padded.top,
            left: padded.left,
            width: padded.width,
            height: padded.height,
          }}
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="App tour"
        className="fixed w-80 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/10"
        style={{ width: CARD_WIDTH, ...cardPosition(rect) }}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium text-foreground">{current.title}</h2>
          <Button
            variant="ghost"
            size="icon-xs"
            loading={finishing === "skip"}
            disabled={!!finishing}
            aria-label="Skip tour"
            onClick={() => finish()}
            className="-mt-1 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-white/10 hover:text-foreground"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-text-muted">{current.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-brand" : "w-1.5 bg-border-strong"
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={!!finishing}
                onClick={back}
              >
                Back
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!!finishing}
              loading={finishing === "done"}
              onClick={next}
            >
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
