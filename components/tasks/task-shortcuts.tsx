"use client"

import { useEffect, useState } from "react"

import { useShell } from "@/components/shell/shell-context"

import { QuickAddDialog } from "./quick-add-dialog"
import { ShortcutSheet } from "./shortcut-sheet"

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null
  return !!node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)
}

/** Global `Q` (quick-add) and `?` (shortcut sheet) shortcuts, mounted once
 * in the app shell. `Cmd/Ctrl+K` opens the global command palette
 * (`components/search/command-palette.tsx`); `/` and `X` are scoped to the
 * Tasks page itself (search focus and per-row toggle respectively). */
export function TaskShortcuts() {
  const { openAddTask } = useShell()
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === "q") {
        e.preventDefault()
        openAddTask()
      } else if (e.key === "?") {
        e.preventDefault()
        setSheetOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openAddTask])

  return (
    <>
      <QuickAddDialog />
      <ShortcutSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  )
}
