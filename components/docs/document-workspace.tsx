"use client"

import { useEditorState, type Editor } from "@tiptap/react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  GripVerticalIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "react-hot-toast"
import { Button } from "@/components/ui/button"
import {
  DocumentThemeToggle,
  type DocumentTheme,
} from "./document-theme-toggle"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  blockChoices,
  convertBlock,
  currentBlock,
  deleteBlock,
  dragBlock,
  finishBlockDrag,
  duplicateBlock,
  moveBlock,
} from "./block-actions"
import {
  documentFilename,
  escapeHtml,
  textDocumentMarkdown,
  type TextNode,
} from "@/lib/docs/text-document"

export function BlockActions({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      const { node, index } = currentBlock(editor)
      return {
        type: node.type.name,
        up: index > 0,
        down: index < editor.state.doc.childCount - 1,
      }
    },
  })
  const act = (callback: () => void) => {
    callback()
    setOpen(false)
  }
  return (
    <div className="flex items-center gap-0.5">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Drag selected block"
        title="Drag the block at your cursor to a new position"
        draggable
        onDragStart={(event) => dragBlock(editor, event)}
        onDragEnd={() => finishBlockDrag(editor)}
      >
        <GripVerticalIcon />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Block actions"
              onMouseDown={(e) => e.preventDefault()}
            />
          }
        >
          <MoreHorizontalIcon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-52 gap-1">
          <span className="px-2 py-1 text-xs text-text-muted">
            Selected block
          </span>
          <Button
            variant="ghost"
            className="justify-start"
            disabled={!state.up}
            onClick={() => act(() => moveBlock(editor, -1))}
          >
            <ArrowUpIcon />
            Move up
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            disabled={!state.down}
            onClick={() => act(() => moveBlock(editor, 1))}
          >
            <ArrowDownIcon />
            Move down
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => act(() => duplicateBlock(editor))}
          >
            <CopyIcon />
            Duplicate block
          </Button>
          {state.type !== "image" && state.type !== "horizontalRule" && (
            <>
              <span className="mt-1 border-t border-border px-2 pt-2 text-xs text-text-muted">
                Convert to
              </span>
              {blockChoices.map((choice) => (
                <Button
                  key={choice.kind}
                  variant="ghost"
                  className="justify-start"
                  onClick={() => act(() => convertBlock(editor, choice.kind))}
                >
                  {choice.label}
                </Button>
              ))}
            </>
          )}
          <Button
            variant="destructive"
            className="justify-start"
            onClick={() => act(() => deleteBlock(editor))}
          >
            <Trash2Icon />
            Delete block
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function downloadMarkdown(editor: Editor, title: string) {
  const blob = new Blob(
    [textDocumentMarkdown(editor.getJSON() as TextNode, title)],
    { type: "text/markdown;charset=utf-8" }
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = documentFilename(title)
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function printDocument(editor: Editor, title: string) {
  const iframe = document.createElement("iframe")
  iframe.title = "Document print preview"
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0"
  document.body.append(iframe)
  const target = iframe.contentWindow
  const doc = iframe.contentDocument
  if (!target || !doc) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || "Untitled")}</title><style>
    @page { margin: 18mm; } body { font: 12pt/1.6 system-ui,sans-serif; color:#111; overflow-wrap:anywhere; }
    img { max-width:100%; height:auto; } figure { margin:1em 0; break-inside:avoid; } figcaption { font-size:10pt; color:#555; text-align:inherit; }
    pre { white-space:pre-wrap; background:#f4f4f4; padding:12px; } blockquote { border-left:2px solid #aaa; padding-left:12px; }
    ul[data-type="taskList"] { list-style:none; padding-left:0; } li[data-type="taskItem"] { display:flex; gap:8px; } li[data-type="taskItem"] label { padding-top:2px; }
    h1,h2,h3 { break-after:avoid; } a { color:inherit; } p { margin:0 0 .5em; }
    </style></head><body>${title.trim() ? `<h1>${escapeHtml(title)}</h1>` : ""}${editor.getHTML()}</body></html>`)
  doc.close()
  await Promise.all(
    Array.from(doc.images).map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve()
            return
          }
          const done = () => {
            clearTimeout(timer)
            image.removeEventListener("load", done)
            image.removeEventListener("error", done)
            resolve()
          }
          const timer = setTimeout(done, 8000)
          image.addEventListener("load", done)
          image.addEventListener("error", done)
        })
    )
  )
  target.addEventListener("afterprint", () => iframe.remove(), { once: true })
  // Some browsers omit afterprint when their print dialog is cancelled.
  setTimeout(() => iframe.remove(), 60000)
  try {
    target.focus()
    target.print()
  } catch (error) {
    iframe.remove()
    throw error
  }
}

export function WorkspaceControls({
  editor,
  title,
  width,
  onWidth,
  fullscreen,
  onFullscreen,
  uploading,
  theme,
  onThemeChange,
}: {
  editor: Editor
  title: string
  width: string
  onWidth: (width: string) => void
  fullscreen?: boolean
  onFullscreen?: () => void
  uploading: boolean
  theme?: DocumentTheme
  onThemeChange?: (theme: DocumentTheme) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {theme && onThemeChange && (
        <DocumentThemeToggle theme={theme} onChange={onThemeChange} />
      )}
      <select
        aria-label="Writing width"
        value={width}
        onChange={(e) => onWidth(e.target.value)}
        className="h-7 max-w-24 rounded-md border border-border bg-surface px-1.5 text-xs sm:max-w-none"
      >
        <option value="narrow">Narrow</option>
        <option value="comfortable">Comfortable</option>
        <option value="wide">Wide</option>
      </select>
      <Popover>
        <PopoverTrigger
          render={<Button size="sm" variant="outline" disabled={uploading} />}
        >
          Export
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 gap-1">
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => downloadMarkdown(editor, title)}
          >
            Download Markdown
          </Button>
          <span className="px-2 pb-2 text-xs text-text-muted">
            Includes text, images and captions. Image alignment and sizes
            aren&apos;t preserved.
          </span>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() =>
              void printDocument(editor, title).catch(() =>
                toast.error(
                  "Couldn't open the print preview. Please try again."
                )
              )
            }
          >
            Print / Save as PDF
          </Button>
        </PopoverContent>
      </Popover>
      {onFullscreen && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          onClick={onFullscreen}
        >
          {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      )}
    </div>
  )
}

type Slash = { from: number; to: number; query: string }
function getSlash(editor: Editor): Slash | null {
  const { $from, empty } = editor.state.selection
  if (!empty || $from.parent.type.name !== "paragraph") return null
  const before = $from.parent.textBetween(0, $from.parentOffset, "", "\ufffc")
  const match = /^\/([\w -]*)$/.exec(before)
  return match
    ? { from: $from.start(), to: $from.pos, query: match[1].toLowerCase() }
    : null
}

export function SlashMenu({
  editor,
  keyHandlerRef,
  onImage,
}: {
  editor: Editor
  keyHandlerRef: React.RefObject<((event: KeyboardEvent) => boolean) | null>
  onImage?: () => void
}) {
  const slash = useEditorState({
    editor,
    selector: ({ editor }) => getSlash(editor),
  })
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [index, setIndex] = useState(0)
  const menu = useRef<HTMLDivElement>(null)
  const [location, setLocation] = useState({ top: 0, left: 0 })
  const active = slash && dismissed !== slash.from ? slash : null
  const choices = [
    ...blockChoices.map((choice) => ({
      label: choice.label,
      kind: choice.kind,
    })),
    { label: "Divider", kind: "divider" as const },
    ...(onImage ? [{ label: "Image", kind: "image" as const }] : []),
  ].filter(
    (choice) =>
      !active?.query || choice.label.toLowerCase().includes(active.query)
  )
  const selected = Math.min(index, Math.max(0, choices.length - 1))

  const run = (i: number) => {
    if (!active || !choices[i]) return
    const chain = editor
      .chain()
      .focus()
      .deleteRange({ from: active.from, to: active.to })
      .setTextSelection(active.from)
    const kind = choices[i].kind
    if (kind === "paragraph") chain.setParagraph().run()
    if (kind === "heading") chain.setHeading({ level: 2 }).run()
    if (kind === "bulletList") chain.toggleBulletList().run()
    if (kind === "orderedList") chain.toggleOrderedList().run()
    if (kind === "taskList") chain.toggleTaskList().run()
    if (kind === "blockquote") chain.toggleBlockquote().run()
    if (kind === "codeBlock") chain.setCodeBlock().run()
    if (kind === "divider") chain.setHorizontalRule().run()
    if (kind === "image") {
      chain.run()
      onImage?.()
    }
    setIndex(0)
  }
  useLayoutEffect(() => {
    keyHandlerRef.current = (event) => {
      if (!active) return false
      if (event.key === "Escape") {
        setDismissed(active.from)
        return true
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setIndex(
          (selected + (event.key === "ArrowDown" ? 1 : -1) + choices.length) %
            Math.max(1, choices.length)
        )
        return true
      }
      if (event.key === "Enter" && choices.length) {
        run(selected)
        return true
      }
      return false
    }
    return () => {
      keyHandlerRef.current = null
    }
  })
  useEffect(() => {
    const reset = () => {
      if (!getSlash(editor)) {
        setDismissed(null)
        setIndex(0)
      }
    }
    editor.on("transaction", reset)
    return () => {
      editor.off("transaction", reset)
    }
  }, [editor])
  useEffect(() => {
    if (!active) return
    const position = () => {
      if (editor.isDestroyed) return
      const coords = editor.view.coordsAtPos(active.to)
      const height = menu.current?.offsetHeight ?? 260
      setLocation({
        left: Math.max(8, Math.min(coords.left, window.innerWidth - 256)),
        top: Math.max(
          8,
          coords.bottom + height + 8 < window.innerHeight
            ? coords.bottom + 4
            : coords.top - height - 4
        ),
      })
    }
    position()
    window.addEventListener("scroll", position, true)
    window.addEventListener("resize", position)
    return () => {
      window.removeEventListener("scroll", position, true)
      window.removeEventListener("resize", position)
    }
  }, [active, editor, choices.length])
  if (!active) return null
  return (
    <div
      ref={menu}
      role="listbox"
      aria-label="Insert block"
      className="fixed z-[70] max-h-72 w-60 overflow-auto rounded-lg border border-border-strong bg-popover p-1 text-popover-foreground"
      style={location}
    >
      <p className="px-2 py-1 text-xs text-text-muted">Insert block</p>
      {choices.map((choice, i) => (
        <button
          type="button"
          role="option"
          aria-selected={selected === i}
          key={choice.label}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(i)}
          className={`block w-full rounded px-2 py-1.5 text-left text-sm ${selected === i ? "bg-brand-soft text-brand" : "hover:bg-muted"}`}
        >
          {choice.label}
        </button>
      ))}
      {!choices.length && (
        <p className="px-2 py-2 text-xs text-text-muted">No matching blocks</p>
      )}
    </div>
  )
}
