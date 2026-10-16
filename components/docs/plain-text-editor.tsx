"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Compartment, EditorState, Transaction } from "@codemirror/state"
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  rectangularSelection,
  crosshairCursor,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view"
import {
  history,
  historyKeymap,
  standardKeymap,
  addCursorAbove,
  addCursorBelow,
} from "@codemirror/commands"
import type { DocumentTheme } from "./document-theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SearchIcon } from "lucide-react"
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  searchPanelOpen,
  selectNextOccurrence,
} from "@codemirror/search"
import {
  plainTextLineAction,
  singlePlainTextCursor,
} from "@/lib/docs/plain-text-editing"
import { PlainTextEditActions } from "./plain-text-edit-actions"
import { plainTextSearch } from "./plain-text-search"
import {
  PlainTextControls,
  usePlainTextPreferences,
} from "./plain-text-controls"
import {
  plainTextTab,
  type PlainTextPreferences,
} from "@/lib/docs/plain-text-preferences"
import {
  parseLineNumber,
  plainTextPosition,
} from "@/lib/docs/plain-text-navigation"

function editorTheme(theme: DocumentTheme) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "var(--surface)",
        color: "var(--text)",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: "14px",
        lineHeight: "1.65",
      },
      ".cm-content": { padding: "16px 0", minHeight: "100%" },
      ".cm-line": { padding: "0 16px" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: "var(--brand-soft)",
      },
      ".cm-placeholder": { color: "var(--text-subtle)" },
      ".cm-panels": {
        backgroundColor: "var(--surface-raised)",
        color: "var(--text)",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
      },
      ".cm-panels-top": { borderBottom: "1px solid var(--border-hairline)" },
      ".cm-find-replace": { maxHeight: "40dvh", overflowY: "auto" },
      ".cm-searchMatch": {
        backgroundColor: "var(--brand-soft)",
        outline: "1px solid var(--border-strong)",
      },
      ".cm-searchMatch-selected": {
        backgroundColor: "var(--brand-soft)",
        outline: "2px solid var(--brand)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--surface)",
        color: "var(--text-subtle)",
        borderRight: "1px solid var(--border-hairline)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 10px",
        minWidth: "40px",
      },
      ".cm-activeLine": { backgroundColor: "var(--brand-soft)" },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--brand-soft)",
        color: "var(--text)",
      },
    },
    { dark: theme === "dark" }
  )
}

function editorPreferences(preferences: PlainTextPreferences) {
  return [
    preferences.wrap ? EditorView.lineWrapping : [],
    preferences.whitespace ? highlightWhitespace() : [],
    EditorState.tabSize.of(preferences.tabSize),
    keymap.of([
      {
        key: "Tab",
        run(editor) {
          if (editor.state.readOnly) return false
          editor.dispatch({
            ...plainTextTab(editor.state, preferences),
            scrollIntoView: true,
            userEvent: "input.type",
          })
          return true
        },
      },
    ]),
  ]
}

export default function PlainTextEditor({
  value,
  theme,
  title,
  onChange,
  editable = true,
}: {
  value: string
  theme: DocumentTheme
  title: string
  onChange: (text: string) => void
  editable?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const themeSlot = useRef(new Compartment())
  const editingSlot = useRef(new Compartment())
  const preferencesSlot = useRef(new Compartment())
  const { preferences, changePreferences } = usePlainTextPreferences()
  const callback = useRef(onChange)
  const [position, setPosition] = useState(() => ({
    line: 1,
    column: 1,
    lines: value.split("\n").length,
    selected: 0,
    selections: 1,
  }))
  const [editActionsOpen, setEditActionsOpen] = useState(false)
  const [goToLineOpen, setGoToLineOpen] = useState(false)
  const [lineInput, setLineInput] = useState("")
  const [lineError, setLineError] = useState("")
  const lineInputRef = useRef<HTMLInputElement>(null)
  const panelId = useId()

  function openGoToLine() {
    const editor = view.current
    if (!editor) return
    closeSearchPanel(editor)
    setLineInput(
      String(editor.state.doc.lineAt(editor.state.selection.main.head).number)
    )
    setLineError("")
    setGoToLineOpen(true)
    lineInputRef.current?.focus()
    lineInputRef.current?.select()
  }
  function closeGoToLine() {
    setGoToLineOpen(false)
    view.current?.focus()
  }
  function openFind(replace = false) {
    const editor = view.current
    if (!editor) return
    setGoToLineOpen(false)
    openSearchPanel(editor)
    if (replace && !editor.state.readOnly) {
      const input = editor.dom.querySelector<HTMLInputElement>(
        'input[name="replace"]'
      )
      input?.focus()
      input?.select()
    }
  }
  useEffect(() => {
    if (goToLineOpen) {
      lineInputRef.current?.focus()
      lineInputRef.current?.select()
    }
  }, [goToLineOpen])
  useEffect(() => {
    callback.current = onChange
  }, [onChange])
  useEffect(() => {
    if (!container.current) return
    const editor = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          EditorState.allowMultipleSelections.of(true),
          rectangularSelection(),
          crosshairCursor(),
          plainTextSearch(),
          preferencesSlot.current.of(editorPreferences(preferences)),
          EditorState.lineSeparator.of("\n"),
          editingSlot.current.of([
            EditorState.readOnly.of(!editable),
            EditorView.editable.of(editable),
          ]),
          drawSelection(),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([
            { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
            {
              key: "Mod-Alt-ArrowUp",
              run: addCursorAbove,
              preventDefault: true,
            },
            {
              key: "Mod-Alt-ArrowDown",
              run: addCursorBelow,
              preventDefault: true,
            },
            {
              key: "Alt-ArrowUp",
              run: plainTextLineAction("moveUp"),
              preventDefault: true,
            },
            {
              key: "Alt-ArrowDown",
              run: plainTextLineAction("moveDown"),
              preventDefault: true,
            },
            {
              key: "Alt-Shift-ArrowUp",
              run: plainTextLineAction("duplicateUp"),
              preventDefault: true,
            },
            {
              key: "Alt-Shift-ArrowDown",
              run: plainTextLineAction("duplicateDown"),
              preventDefault: true,
            },
            ...standardKeymap,
            ...historyKeymap,
          ]),
          placeholder("Write plain text…"),
          EditorView.contentAttributes.of({
            "aria-label": "Plain text content",
            "aria-description":
              "Tab inserts the configured indentation. Shift+Tab moves focus to the editor controls. Control+G or Command+G goes to a line.",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          themeSlot.current.of(editorTheme(theme)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet)
              setPosition(plainTextPosition(update.state))
            if (update.docChanged) callback.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      view.current = null
      editor.destroy()
    }
    // This instance stays alive across typing, saving, themes and full-screen changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false),
      })
  }, [value])
  useEffect(() => {
    view.current?.dispatch({
      effects: themeSlot.current.reconfigure(editorTheme(theme)),
    })
  }, [theme])
  useEffect(() => {
    view.current?.dispatch({
      effects: preferencesSlot.current.reconfigure(
        editorPreferences(preferences)
      ),
    })
  }, [preferences])
  useEffect(() => {
    view.current?.dispatch({
      effects: editingSlot.current.reconfigure([
        EditorState.readOnly.of(!editable),
        EditorView.editable.of(editable),
      ]),
    })
  }, [editable])
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onKeyDownCapture={(event) => {
        const editor = view.current
        if (!editor || event.nativeEvent.isComposing) return
        const mod = (event.ctrlKey || event.metaKey) && !event.altKey
        const key = event.key.toLowerCase()
        if (mod && (key === "f" || key === "h")) {
          event.preventDefault()
          event.stopPropagation()
          openFind(key === "h")
        } else if (event.key === "F3") {
          event.preventDefault()
          event.stopPropagation()
          setGoToLineOpen(false)
          ;(event.shiftKey ? findPrevious : findNext)(editor)
        } else if (event.key === "Escape" && searchPanelOpen(editor.state)) {
          event.preventDefault()
          event.stopPropagation()
          closeSearchPanel(editor)
          editor.focus()
        } else if (
          event.key === "Escape" &&
          editor.contentDOM.contains(event.target as Node) &&
          (editor.state.selection.ranges.length > 1 ||
            !editor.state.selection.main.empty)
        ) {
          event.preventDefault()
          event.stopPropagation()
          singlePlainTextCursor(editor)
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "g"
        ) {
          event.preventDefault()
          event.stopPropagation()
          openGoToLine()
        }
      }}
    >
      <PlainTextControls
        preferences={preferences}
        onChange={changePreferences}
        editorRef={view}
        title={title}
        theme={theme}
        editable={editable}
      />
      <div ref={container} className="min-h-0 min-w-0 flex-1 overflow-hidden" />
      {goToLineOpen && (
        <form
          id={panelId}
          aria-label="Go to line"
          className="shrink-0 border-t border-border bg-surface-raised px-3 py-2"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              closeGoToLine()
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            const editor = view.current
            if (!editor) return
            const line = parseLineNumber(lineInput, editor.state.doc.lines)
            if (line === null) {
              setLineError(
                `Enter a whole line number from 1 to ${editor.state.doc.lines}.`
              )
              lineInputRef.current?.focus()
              return
            }
            const target = editor.state.doc.line(line).from
            editor.dispatch({
              selection: { anchor: target },
              effects: EditorView.scrollIntoView(target, { y: "center" }),
            })
            closeGoToLine()
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`${panelId}-input`}
              className="text-xs text-text-muted"
            >
              Go to line
            </label>
            <Input
              ref={lineInputRef}
              id={`${panelId}-input`}
              inputMode="numeric"
              autoComplete="off"
              className="w-24"
              value={lineInput}
              aria-invalid={!!lineError}
              aria-describedby={`${panelId}-hint${lineError ? ` ${panelId}-error` : ""}`}
              onChange={(event) => {
                setLineInput(event.target.value)
                setLineError("")
              }}
            />
            <Button type="submit" size="sm">
              Go
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={closeGoToLine}
            >
              Close
            </Button>
            <span id={`${panelId}-hint`} className="text-xs text-subtle">
              1–{position.lines}
            </span>
          </div>
          {lineError && (
            <p
              id={`${panelId}-error`}
              role="alert"
              className="mt-1 text-xs text-destructive"
            >
              {lineError}
            </p>
          )}
        </form>
      )}
      {editActionsOpen && (
        <PlainTextEditActions
          id={`${panelId}-editing`}
          editorRef={view}
          editable={editable}
        />
      )}
      <div
        role="group"
        aria-label="Text position"
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1 text-xs text-text-muted tabular-nums"
        title="Columns and selections count displayed characters. Each tab counts as one character. Line numbers count logical lines."
      >
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="-ml-2 font-mono text-xs"
          aria-label={`Go to line. Current position: line ${position.line}, column ${position.column}`}
          aria-keyshortcuts="Control+G Meta+G"
          aria-expanded={goToLineOpen}
          aria-controls={goToLineOpen ? panelId : undefined}
          title="Go to line (Ctrl+G / ⌘G)"
          onClick={openGoToLine}
        >
          Ln {position.line}, Col {position.column}
        </Button>
        <span>
          {position.lines} {position.lines === 1 ? "line" : "lines"}
        </span>
        {position.selected > 0 && <span>{position.selected} selected</span>}
        {position.selections > 1 && (
          <span>
            {position.selections}{" "}
            {position.selected > 0 ? "selections" : "cursors"}
          </span>
        )}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ml-auto"
          aria-label="Editing actions"
          aria-expanded={editActionsOpen}
          aria-controls={editActionsOpen ? `${panelId}-editing` : undefined}
          onClick={() => setEditActionsOpen(!editActionsOpen)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="Find and replace"
          title="Find (Ctrl/Cmd+F) · Replace (Ctrl/Cmd+H)"
          onClick={() => openFind()}
        >
          <SearchIcon /> Find
        </Button>
      </div>
    </div>
  )
}
