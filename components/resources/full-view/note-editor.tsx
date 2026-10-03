"use client"

import { TaskItem, TaskList } from "@tiptap/extension-list"
import Image from "@tiptap/extension-image"
import { Placeholder } from "@tiptap/extensions"
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  TypeIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Doc = Record<string, unknown>

type UploadedImage = {
  url: string
  width?: number | null
  height?: number | null
}
type UploadImage = (file: File) => Promise<UploadedImage>
type LinkPreview = (url: string) => Promise<{ title: string | null }>

const BARE_URL_RE = /^https?:\/\/\S+$/i

function isBareUrl(text: string) {
  return BARE_URL_RE.test(text.trim())
}

function findNode(
  view: EditorView,
  match: (node: ProseMirrorNode) => boolean
): { pos: number; node: ProseMirrorNode } | null {
  let found: { pos: number; node: ProseMirrorNode } | null = null
  view.state.doc.descendants((node, pos) => {
    if (found) return false
    if (match(node)) found = { pos, node }
  })
  return found
}

/** Range of the text node that still reads as the raw `href` with a link
 * mark pointing at it (i.e. hasn't been edited since it was pasted). */
function findLinkText(
  view: EditorView,
  href: string
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null
  view.state.doc.descendants((node, pos) => {
    if (found) return false
    if (
      node.isText &&
      node.text === href &&
      node.marks.some((m) => m.type.name === "link" && m.attrs.href === href)
    ) {
      found = { from: pos, to: pos + node.nodeSize }
    }
  })
  return found
}

/** Inserts a local object-URL image immediately, then swaps it for the
 * uploaded URL (or removes it on failure) once the upload settles. */
function insertImageWithUpload(
  view: EditorView,
  file: File,
  upload: UploadImage,
  pos?: number
) {
  const imageType = view.state.schema.nodes.image
  if (!imageType) return
  const localSrc = URL.createObjectURL(file)
  const node = imageType.create({ src: localSrc, alt: file.name })
  const insertAt = pos ?? view.state.selection.from
  view.dispatch(view.state.tr.insert(insertAt, node))

  upload(file)
    .then(({ url, width, height }) => {
      if (view.isDestroyed) return
      const match = findNode(
        view,
        (n) => n.type.name === "image" && n.attrs.src === localSrc
      )
      if (!match) return
      view.dispatch(
        view.state.tr.setNodeMarkup(match.pos, undefined, {
          ...match.node.attrs,
          src: url,
          width: width ?? match.node.attrs.width,
          height: height ?? match.node.attrs.height,
        })
      )
    })
    .catch((error) => {
      toast.error(`Image upload failed: ${(error as Error).message}`)
      if (view.isDestroyed) return
      const match = findNode(
        view,
        (n) => n.type.name === "image" && n.attrs.src === localSrc
      )
      if (match)
        view.dispatch(
          view.state.tr.delete(match.pos, match.pos + match.node.nodeSize)
        )
    })
    .finally(() => URL.revokeObjectURL(localSrc))
}

/** Inserts the raw URL as a link right away, then quietly swaps the link
 * text for the page's title once it's fetched — a pasted URL becomes a
 * readable "smart link" instead of staying a wall of characters. */
function insertSmartLink(view: EditorView, url: string, preview: LinkPreview) {
  const linkMarkType = view.state.schema.marks.link
  if (!linkMarkType) return
  const { from } = view.state.selection
  const mark = linkMarkType.create({ href: url })
  view.dispatch(
    view.state.tr.insertText(url, from).addMark(from, from + url.length, mark)
  )

  preview(url)
    .then(({ title }) => {
      if (!title || view.isDestroyed) return
      const found = findLinkText(view, url)
      if (!found) return
      view.dispatch(
        view.state.tr
          .insertText(title, found.from, found.to)
          .addMark(
            found.from,
            found.from + title.length,
            linkMarkType.create({ href: url })
          )
      )
    })
    .catch(() => {})
}

/** ProseMirror's default plain-text paste collapses runs of multiple blank
 * lines into a single paragraph break, which loses the exact spacing of
 * content copied from an external editor (e.g. Notepad++). This instead
 * creates one paragraph per source line — blank lines included — so the
 * pasted shape matches the original one-for-one. */
function insertLinesPreservingBlanks(view: EditorView, text: string) {
  const paragraphType = view.state.schema.nodes.paragraph
  if (!paragraphType) return false
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const nodes = lines.map((line) =>
    paragraphType.create(null, line ? view.state.schema.text(line) : undefined)
  )
  const slice = new Slice(Fragment.fromArray(nodes), 0, 0)
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
  return true
}

function ToolbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(active && "bg-brand-soft text-brand")}
    >
      {children}
    </Button>
  )
}

const FLOATING_BAR_CLASS =
  "z-[60] flex items-center gap-0.5 rounded-lg border border-border-strong bg-surface-raised p-1 shadow-popover"

/** Appears next to the current text selection — inline formatting only,
 * so it's there when you've selected text and gone otherwise. */
function SelectionMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor} className={FLOATING_BAR_CLASS}>
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </ToolbarButton>
    </BubbleMenu>
  )
}

/** Explicit, always-available trigger for formatting (headings, lists,
 * image) and inline marks (bold, italic) alike, so block-level controls
 * don't need a popover of their own at every line. */
function FormattingMenu({
  editor,
  onUploadImage,
}: {
  editor: Editor
  onUploadImage?: UploadImage
}) {
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Formatting options"
            className="absolute top-2 right-2 z-10 text-subtle hover:text-text-muted"
          />
        }
      >
        <TypeIcon />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto flex-row flex-wrap gap-0.5 p-1"
      >
        <ToolbarButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2Icon />
        </ToolbarButton>
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecksIcon />
        </ToolbarButton>
        {onUploadImage ? (
          <>
            <ToolbarButton
              label="Insert image"
              onClick={() => fileInput.current?.click()}
            >
              <ImageIcon />
            </ToolbarButton>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (file)
                  insertImageWithUpload(editor.view, file, onUploadImage)
              }}
            />
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Tiptap editor for note bodies. Saves JSON + plain text with a debounce;
 * read-only mode renders the same document without the formatting menus.
 * Formatting controls stay out of view until summoned: select text for a
 * bold/italic bubble menu, or click the formatting trigger for everything
 * else (headings, lists, image). Pasting or dropping an image uploads it (when
 * `onUploadImage` is given); pasting a bare URL becomes a "smart" link whose
 * text is swapped for the page's title (when `onLinkPreview` is given);
 * pasting multi-line plain text keeps every blank line exactly as copied.
 */
export default function NoteEditor({
  content,
  editable = true,
  onSave,
  onUploadImage,
  onLinkPreview,
  debounceMs = 800,
  bare = false,
}: {
  content: Doc | null
  editable?: boolean
  onSave?: (doc: Doc, text: string) => void
  onUploadImage?: UploadImage
  onLinkPreview?: LinkPreview
  /** Delay before `onSave` fires after the last keystroke. 0 calls it
   * synchronously on every update — for a caller that only holds the
   * result locally (no network call) and needs it always current, e.g.
   * to read right before an explicit Save action. */
  debounceMs?: number
  /** Swaps the bordered-card look for a sunken background instead, for a
   * host (the Quick Notes modal) that already provides its own chrome but
   * still wants the editable area visually set apart from it. */
  bare?: boolean
}) {
  const timer = useRef<number | undefined>(undefined)
  const onSaveRef = useRef(onSave)
  const onUploadImageRef = useRef(onUploadImage)
  const onLinkPreviewRef = useRef(onLinkPreview)
  useEffect(() => {
    onSaveRef.current = onSave
    onUploadImageRef.current = onUploadImage
    onLinkPreviewRef.current = onLinkPreview
  })

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: !editable,
          autolink: true,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: "rounded-lg max-w-full" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Write something…" }),
    ],
    content: content ?? undefined,
    editorProps: {
      attributes: {
        class: cn(
          "prose-dark px-3 py-2 outline-none [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-subtle [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          bare ? "min-h-full" : "min-h-40"
        ),
      },
      handlePaste: (view, event) => {
        const data = event.clipboardData
        if (!data) return false

        const upload = onUploadImageRef.current
        if (upload) {
          const images = Array.from(data.files).filter((f) =>
            f.type.startsWith("image/")
          )
          if (images.length) {
            event.preventDefault()
            for (const file of images) insertImageWithUpload(view, file, upload)
            return true
          }
        }

        if (data.types.includes("Files")) return false
        const html = data.getData("text/html")
        const text = data.getData("text/plain")
        if (html || !text) return false

        const preview = onLinkPreviewRef.current
        const trimmed = text.trim()
        if (preview && view.state.selection.empty && isBareUrl(trimmed)) {
          event.preventDefault()
          insertSmartLink(view, trimmed, preview)
          return true
        }

        // Plain-text-only clipboard (e.g. copied from Notepad++) with no
        // HTML to fall back on: preserve every source line ourselves,
        // since ProseMirror's default parser collapses runs of blank lines.
        if (text.includes("\n")) {
          event.preventDefault()
          return insertLinesPreservingBlanks(view, text)
        }

        return false
      },
      handleDrop: (view, event) => {
        const upload = onUploadImageRef.current
        const images = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        )
        if (!upload || !images.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        for (const file of images)
          insertImageWithUpload(view, file, upload, pos?.pos)
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const commit = () =>
        onSaveRef.current?.(
          editor.getJSON() as Doc,
          editor.getText({ blockSeparator: "\n" })
        )
      window.clearTimeout(timer.current)
      if (debounceMs <= 0) {
        commit()
        return
      }
      timer.current = window.setTimeout(commit, debounceMs)
    },
  })

  // Flush a pending save when the editor unmounts (drawer closed quickly).
  useEffect(() => {
    return () => {
      if (timer.current !== undefined && editor && !editor.isDestroyed) {
        window.clearTimeout(timer.current)
        onSaveRef.current?.(
          editor.getJSON() as Doc,
          editor.getText({ blockSeparator: "\n" })
        )
      }
    }
  }, [editor])

  if (!editor)
    return (
      <div
        className={cn(
          "min-h-40 rounded-lg",
          !bare && "border border-border bg-surface"
        )}
      />
    )
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg transition-colors",
        bare && "flex h-full min-h-0 flex-col",
        editable &&
          (bare
            ? "bg-bg-sunken ring-1 ring-transparent focus-within:ring-border-strong"
            : "border border-border bg-surface focus-within:border-border-strong")
      )}
    >
      {editable ? (
        <>
          <SelectionMenu editor={editor} />
          <FormattingMenu editor={editor} onUploadImage={onUploadImage} />
        </>
      ) : null}
      <EditorContent
        editor={editor}
        className={bare ? "min-h-0 flex-1 overflow-y-auto" : undefined}
      />
    </div>
  )
}
