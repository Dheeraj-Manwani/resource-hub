"use client"

import { TaskItem, TaskList } from "@tiptap/extension-list"
import Image from "@tiptap/extension-image"
import { Placeholder } from "@tiptap/extensions"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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

function Toolbar({
  editor,
  onUploadImage,
}: {
  editor: Editor
  onUploadImage?: UploadImage
}) {
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-wrap gap-0.5 border-b border-border p-1">
      <ToolbarButton
        label="Heading"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
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
              if (file) insertImageWithUpload(editor.view, file, onUploadImage)
            }}
          />
        </>
      ) : null}
    </div>
  )
}

/**
 * Tiptap editor for note bodies. Saves JSON + plain text with a debounce;
 * read-only mode renders the same document without the toolbar. Pasting or
 * dropping an image uploads it (when `onUploadImage` is given); pasting a
 * bare URL becomes a "smart" link whose text is swapped for the page's
 * title (when `onLinkPreview` is given).
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
  /** Drops the outer border/background box and the content's own side
   * padding, for a host (the Quick Notes modal) that already provides its
   * own chrome and wants the editor to fill the space edge-to-edge. */
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
          "prose-dark min-h-40 py-2 outline-none [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-subtle [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          bare ? "px-0" : "px-3"
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

        const preview = onLinkPreviewRef.current
        if (
          preview &&
          view.state.selection.empty &&
          !data.types.includes("Files")
        ) {
          const text = data.getData("text/plain")?.trim()
          const html = data.getData("text/html")
          if (text && !html && isBareUrl(text)) {
            event.preventDefault()
            insertSmartLink(view, text, preview)
            return true
          }
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
        "overflow-hidden rounded-lg",
        editable &&
          !bare &&
          "border border-border bg-surface focus-within:border-border-strong"
      )}
    >
      {editable ? (
        <Toolbar editor={editor} onUploadImage={onUploadImage} />
      ) : null}
      <EditorContent editor={editor} />
    </div>
  )
}
