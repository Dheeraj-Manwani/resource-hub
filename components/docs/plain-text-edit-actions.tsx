"use client"

import type { RefObject } from "react"
import type { Command, EditorView } from "@codemirror/view"
import { addCursorAbove, addCursorBelow } from "@codemirror/commands"
import { selectNextOccurrence } from "@codemirror/search"
import { Button } from "@/components/ui/button"
import {
  plainTextLineAction,
  singlePlainTextCursor,
} from "@/lib/docs/plain-text-editing"

export function PlainTextEditActions({
  editorRef,
  editable,
  id,
}: {
  editorRef: RefObject<EditorView | null>
  editable: boolean
  id: string
}) {
  const actions: {
    label: string
    shortcut: string
    run: Command
    writes?: boolean
  }[] = [
    {
      label: "Add cursor above",
      shortcut: "Ctrl/Cmd+Alt+↑",
      run: addCursorAbove,
    },
    {
      label: "Add cursor below",
      shortcut: "Ctrl/Cmd+Alt+↓",
      run: addCursorBelow,
    },
    {
      label: "Select next occurrence",
      shortcut: "Ctrl/Cmd+D",
      run: selectNextOccurrence,
    },
    { label: "Single cursor", shortcut: "Esc", run: singlePlainTextCursor },
    {
      label: "Duplicate line above",
      shortcut: "Alt+Shift+↑",
      run: plainTextLineAction("duplicateUp"),
      writes: true,
    },
    {
      label: "Duplicate line below",
      shortcut: "Alt+Shift+↓",
      run: plainTextLineAction("duplicateDown"),
      writes: true,
    },
    {
      label: "Move line up",
      shortcut: "Alt+↑",
      run: plainTextLineAction("moveUp"),
      writes: true,
    },
    {
      label: "Move line down",
      shortcut: "Alt+↓",
      run: plainTextLineAction("moveDown"),
      writes: true,
    },
  ]
  return (
    <div
      id={id}
      role="group"
      aria-label="Editing actions"
      className="max-h-[40dvh] shrink-0 overflow-y-auto border-t border-border bg-surface-raised px-3 py-2"
    >
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-h-8 flex-wrap justify-between gap-x-2 text-xs"
            disabled={action.writes && !editable}
            onClick={() => {
              const editor = editorRef.current
              if (!editor || (action.writes && editor.state.readOnly)) return
              action.run(editor)
              editor.focus()
            }}
          >
            <span>{action.label}</span>
            <kbd className="text-[10px] text-subtle">{action.shortcut}</kbd>
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle">
        Ctrl/Cmd+click adds a cursor. Alt+drag selects a rectangle, with one
        selection per line. Esc returns to one cursor. Line actions use whole
        logical lines, including when word wrap is on.
      </p>
    </div>
  )
}
