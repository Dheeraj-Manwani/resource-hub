"use client"

import { useEffect, useRef } from "react"

export function useDocEscape(enabled: boolean, onClose: () => void) {
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) return
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") console.log("doc escape", enabled, dialog.current?.id, (event.target as Element)?.closest('[role="dialog"]')?.id)
      if (
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
    }
    window.addEventListener("keydown", keyDown, true)
    return () => window.removeEventListener("keydown", keyDown, true)
  }, [enabled, onClose])

  return dialog
}
