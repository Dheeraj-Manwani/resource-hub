"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import type { EditorView } from "@codemirror/view"
import { isolateHistory } from "@codemirror/commands"
import {
  DownloadIcon,
  UploadIcon,
  WrapTextIcon,
  PilcrowIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  decodePlainTextFile,
  encodePlainTextFile,
  plainTextFilename,
} from "@/lib/docs/plain-text-file"
import { MAX_PLAIN_TEXT_BYTES } from "@/lib/docs/plain-text"
import type { DocumentTheme } from "./document-theme-toggle"
import {
  defaultPlainTextPreferences,
  plainTextPreferencesKey,
  plainTextPreferencesSchema,
  type PlainTextPreferences,
} from "@/lib/docs/plain-text-preferences"

export function usePlainTextPreferences() {
  const [preferences, setPreferences] = useState<PlainTextPreferences>(() => {
    try {
      const parsed = plainTextPreferencesSchema.safeParse(
        JSON.parse(localStorage.getItem(plainTextPreferencesKey) ?? "null")
      )
      if (parsed.success) return parsed.data
    } catch {
      /* Preferences still work for this editor without browser storage. */
    }
    return defaultPlainTextPreferences
  })
  function changePreferences(patch: Partial<PlainTextPreferences>) {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    try {
      localStorage.setItem(plainTextPreferencesKey, JSON.stringify(next))
    } catch {
      /* Keep the current view preference. */
    }
  }
  return { preferences, changePreferences }
}

export function PlainTextControls({
  preferences,
  onChange,
  editorRef,
  title,
  theme,
  editable,
}: {
  preferences: PlainTextPreferences
  onChange: (patch: Partial<PlainTextPreferences>) => void
  editorRef: RefObject<EditorView | null>
  title: string
  theme: DocumentTheme
  editable: boolean
}) {
  const [indentOpen, setIndentOpen] = useState(false)
  const [pending, setPending] = useState<{ name: string; text: string } | null>(
    null
  )
  const [reading, setReading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const importTrigger = useRef<HTMLButtonElement>(null)
  const mounted = useRef(false)
  const readingRef = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function applyImport(file: { name: string; text: string }) {
    const editor = editorRef.current
    if (!editor || editor.state.readOnly) return
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: file.text },
      selection: { anchor: 0 },
      annotations: isolateHistory.of("full"),
      userEvent: "input.import",
      scrollIntoView: true,
    })
    setPending(null)
    setNotice(
      `Imported ${file.name}. Save to keep this text, or undo to restore the previous text.`
    )
    editor.focus()
  }
  async function importFile(file: File) {
    if (readingRef.current || !editable) return
    readingRef.current = true
    setReading(true)
    setError("")
    setNotice("")
    try {
      if (file.size > MAX_PLAIN_TEXT_BYTES)
        throw new Error("Text files support up to 3 MB.")
      const text = decodePlainTextFile(
        file.name,
        new Uint8Array(await file.arrayBuffer())
      )
      const editor = editorRef.current
      if (!mounted.current || !editor || editor.state.readOnly) return
      const current = editor.state.doc.toString()
      if (current === text)
        setNotice("The file matches the current text. Nothing changed.")
      else if (current.length) setPending({ name: file.name, text })
      else applyImport({ name: file.name, text })
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't read this text file. Try again."
        )
    } finally {
      readingRef.current = false
      if (mounted.current) setReading(false)
    }
  }
  function exportFile() {
    const editor = editorRef.current
    if (!editor) return
    setError("")
    try {
      const blob = new Blob(
        [encodePlainTextFile(editor.state.doc.toString())],
        { type: "text/plain;charset=utf-8" }
      )
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = plainTextFilename(title)
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError("Couldn't export this text. Try again.")
    }
  }

  return (
    <>
      <div className="shrink-0 border-b border-border bg-surface-raised px-3 py-1.5">
        <div
          role="group"
          aria-label="Text controls"
          className="flex flex-wrap items-center gap-1"
        >
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-pressed={preferences.wrap}
            className="aria-pressed:bg-brand-soft aria-pressed:text-brand"
            onClick={() => onChange({ wrap: !preferences.wrap })}
          >
            <WrapTextIcon />
            Word wrap
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-pressed={preferences.whitespace}
            className="aria-pressed:bg-brand-soft aria-pressed:text-brand"
            onClick={() => onChange({ whitespace: !preferences.whitespace })}
          >
            <PilcrowIcon />
            Whitespace
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            aria-expanded={indentOpen}
            onClick={() => setIndentOpen(!indentOpen)}
          >
            Indent: {preferences.indent === "tabs" ? "Tabs" : "Spaces"} ·{" "}
            {preferences.tabSize}
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              ref={importTrigger}
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={!editable}
              loading={reading}
              aria-label="Import .txt"
              title="Import UTF-8 .txt (up to 3 MB)"
              onClick={() => fileInput.current?.click()}
            >
              <UploadIcon />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Export .txt"
              title="Export current text as UTF-8 .txt"
              onClick={exportFile}
            >
              <DownloadIcon />
            </Button>
          </div>
        </div>
        {indentOpen && (
          <div
            role="group"
            aria-label="Indentation settings"
            className="flex flex-wrap items-center gap-3 pt-2 pb-1 text-xs text-text-muted"
          >
            <label className="flex items-center gap-2">
              Indent using
              <select
                className="h-7 rounded-md border border-border-strong bg-surface px-2 text-text"
                value={preferences.indent}
                onChange={(event) =>
                  onChange({
                    indent: event.target
                      .value as PlainTextPreferences["indent"],
                  })
                }
              >
                <option value="tabs">Tabs</option>
                <option value="spaces">Spaces</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Tab width
              <select
                className="h-7 rounded-md border border-border-strong bg-surface px-2 text-text"
                value={preferences.tabSize}
                onChange={(event) =>
                  onChange({
                    tabSize: Number(
                      event.target.value
                    ) as PlainTextPreferences["tabSize"],
                  })
                }
              >
                {[2, 4, 8].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-subtle">
              New indents use this setting. Existing whitespace stays as
              written.
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="pt-1 text-xs text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p
            aria-live="polite"
            className="pt-1 text-xs break-words text-text-muted"
          >
            {notice}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".txt,text/plain"
          aria-label="Choose UTF-8 text file"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            if (file) void importFile(file)
          }}
        />
      </div>
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <DialogContent
          className="document-theme"
          data-document-theme={theme}
          showCloseButton={false}
          finalFocus={() =>
            editorRef.current?.contentDOM ?? importTrigger.current
          }
        >
          <DialogTitle>Replace document text?</DialogTitle>
          <DialogDescription className="break-words">
            Importing {pending?.name} replaces the current text. You can undo
            the import. The title and project stay the same, and changes are
            saved only when you choose Save.
          </DialogDescription>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPending(null)}
            >
              Cancel import
            </Button>
            <Button
              type="button"
              disabled={!editable}
              onClick={() => {
                if (pending) applyImport(pending)
              }}
            >
              Replace text
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
