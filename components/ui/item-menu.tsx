"use client"

import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react"
import { MoreHorizontalIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu"
import { Button } from "./button"
import { cn } from "@/lib/utils"

const EDITABLE =
  "input,textarea,select,[contenteditable=true],[role=checkbox],[data-no-context-menu]"
const HOLD_MS = 550

function MenuSurface({
  trigger,
  handlers,
  children,
}: {
  trigger: ReactElement<HTMLAttributes<HTMLElement>>
  handlers: HTMLAttributes<HTMLElement>
  children: ReactNode
}) {
  return cloneElement(trigger, handlers, children)
}

/** One set of actions for the visible options button, right-click and touch hold.
 * The original element is retained, including its drag/virtualizer ref. */
export function ItemMenu({
  trigger,
  children,
  actions,
  label,
  buttonClassName,
  onOpenChange,
  contextTarget,
}: {
  trigger: ReactElement<HTMLAttributes<HTMLElement>>
  children?: ReactNode
  actions: ReactNode
  label?: string
  buttonClassName?: string
  onOpenChange?: (open: boolean) => void
  /** Some calendar renderers target their outer event element on right-click. */
  contextTarget?: HTMLElement | null
}) {
  const [open, setOpen] = useState(false)
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const target = useRef<HTMLElement | null>(null)
  const cancelHold = useCallback(() => {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
    start.current = null
  }, [])
  function endTouch() {
    cancelHold()
    if (suppressClick.current) {
      if (suppressTimer.current) clearTimeout(suppressTimer.current)
      suppressTimer.current = setTimeout(() => {
        suppressClick.current = false
      }, 1500)
    }
  }
  const changeOpen = useCallback(
    (value: boolean) => {
      setOpen(value)
      onOpenChange?.(value)
    },
    [onOpenChange]
  )
  const openContext = useCallback(
    (element: HTMLElement, x: number, y: number) => {
      const touchPoint = start.current
      if (touchPoint) {
        suppressClick.current = true
        if (suppressTimer.current) clearTimeout(suppressTimer.current)
      }
      cancelHold()
      target.current = element
      setPoint(touchPoint ?? { x, y })
      changeOpen(true)
    },
    [cancelHold, changeOpen]
  )
  useEffect(() => {
    if (!contextTarget) return
    const handle = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest(EDITABLE)) return
      event.preventDefault()
      event.stopPropagation()
      openContext(contextTarget, event.clientX, event.clientY)
    }
    contextTarget.addEventListener("contextmenu", handle)
    return () => contextTarget.removeEventListener("contextmenu", handle)
  }, [contextTarget, openContext])
  useEffect(() => {
    const cancel = () => {
      if (hold.current) clearTimeout(hold.current)
      hold.current = null
      start.current = null
    }
    const freshInteraction = () => {
      suppressClick.current = false
      if (suppressTimer.current) clearTimeout(suppressTimer.current)
    }
    window.addEventListener("scroll", cancel, true)
    window.addEventListener("blur", cancel)
    window.addEventListener("pointerdown", freshInteraction, true)
    window.addEventListener("keydown", freshInteraction, true)
    return () => {
      if (hold.current) clearTimeout(hold.current)
      if (suppressTimer.current) clearTimeout(suppressTimer.current)
      window.removeEventListener("scroll", cancel, true)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("pointerdown", freshInteraction, true)
      window.removeEventListener("keydown", freshInteraction, true)
    }
  }, [])
  const original = trigger.props
  const handlers: HTMLAttributes<HTMLElement> & { "data-item-menu": string } = {
    "data-item-menu": "",
    // Capture before calendar/drag libraries suppress the native context menu.
    onContextMenuCapture: (event) => {
      original.onContextMenuCapture?.(event)
      if (
        (original.onContextMenuCapture && event.defaultPrevented) ||
        (event.target as HTMLElement).closest(EDITABLE)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      openContext(event.currentTarget, event.clientX, event.clientY)
    },
    onTouchStart: (event) => {
      original.onTouchStart?.(event)
      cancelHold()
      if (
        event.defaultPrevented ||
        event.touches.length !== 1 ||
        (event.target as HTMLElement).closest(EDITABLE)
      )
        return
      target.current = event.currentTarget
      const touch = event.touches[0]
      const position = { x: touch.clientX, y: touch.clientY }
      start.current = position
      hold.current = setTimeout(() => {
        hold.current = null
        suppressClick.current = true
        if (suppressTimer.current) clearTimeout(suppressTimer.current)
        setPoint(position)
        changeOpen(true)
      }, HOLD_MS)
    },
    onTouchMove: (event) => {
      original.onTouchMove?.(event)
      if (event.touches.length !== 1) return cancelHold()
      const touch = event.touches[0]
      if (
        start.current &&
        Math.hypot(
          touch.clientX - start.current.x,
          touch.clientY - start.current.y
        ) > 10
      )
        cancelHold()
    },
    onTouchEnd: (event) => {
      original.onTouchEnd?.(event)
      endTouch()
    },
    onTouchCancel: (event) => {
      original.onTouchCancel?.(event)
      endTouch()
    },
    onClickCapture: (event) => {
      if (suppressClick.current) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick.current = false
        return
      }
      original.onClickCapture?.(event)
    },
    onKeyDown: (event) => {
      if (
        (event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")) &&
        !(event.target as HTMLElement).closest(EDITABLE)
      ) {
        event.preventDefault()
        event.stopPropagation()
        target.current = event.currentTarget
        const rect = event.currentTarget.getBoundingClientRect()
        setPoint({ x: rect.left + 16, y: rect.top + rect.height / 2 })
        changeOpen(true)
      } else original.onKeyDown?.(event)
    },
  }
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(value, details) => {
        // Compatibility mouse/focus events after the held finger lifts belong to
        // the opening gesture. A fresh pointer/key press clears this guard.
        if (
          !value &&
          suppressClick.current &&
          (details.reason === "outside-press" || details.reason === "focus-out")
        ) {
          details.cancel()
          return
        }
        changeOpen(value)
      }}
    >
      <MenuSurface trigger={trigger} handlers={handlers}>
        {children ?? original.children}
        {label && (
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={label}
                className={cn("shrink-0", buttonClassName)}
              />
            }
            onPointerDown={(event) => {
              event.stopPropagation()
              cancelHold()
              setPoint(null)
            }}
            onClick={(event) => {
              event.stopPropagation()
              setPoint(null)
            }}
            onKeyDown={(event) => {
              if (
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              )
                return
              event.stopPropagation()
              setPoint(null)
            }}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
        )}
      </MenuSurface>
      <DropdownMenuContent
        className="w-56"
        anchor={
          point
            ? {
                getBoundingClientRect: () =>
                  DOMRect.fromRect({ ...point, width: 0, height: 0 }),
              }
            : undefined
        }
        positionMethod={point ? "fixed" : undefined}
        finalFocus={point ? target : undefined}
      >
        {actions}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
