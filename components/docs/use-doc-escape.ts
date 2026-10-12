"use client"

import { useEffectEvent, useLayoutEffect, useRef } from "react"

export function useDocEscape(enabled: boolean, onClose: () => void) {
  const dialog = useRef<HTMLDivElement>(null)

  const keyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      !enabled ||
      event.key !== "Escape" ||
      event.isComposing ||
      event.defaultPrevented ||
      !dialog.current ||
      !(event.target instanceof Element) ||
      (event.target !== document.body &&
        event.target.closest(
          '[role="dialog"], [role="menu"], [role="listbox"]'
        ) !== dialog.current)
    )
      return
    // Run before editor shortcuts can cancel a pending cell or text edit.
    event.preventDefault()
    event.stopPropagation()
    onClose()
  })
  // Register before the editors mount their own shortcuts; retain that ordering
  // as readiness and pending edits change.
  useLayoutEffect(() => {
    window.addEventListener("keydown", keyDown, true)
    return () => window.removeEventListener("keydown", keyDown, true)
  }, [])

  return dialog
}
