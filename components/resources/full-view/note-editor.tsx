"use client"

import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import { Fragment, Slice } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
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
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { useSyncController } from "@/components/sync-provider"
import { toast } from "react-hot-toast"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { DocumentImage } from "@/components/docs/document-image"
import {
  ImageUploads,
  uploadDocumentImage,
} from "@/components/docs/image-upload"
import { ImageControls } from "@/components/docs/image-controls"
import {
  BlockActions,
  SlashMenu,
  WorkspaceControls,
} from "@/components/docs/document-workspace"
import { hasTemporaryImages } from "@/lib/docs/text-document"
import type { DocumentTheme } from "@/components/docs/document-theme-toggle"

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
    <BubbleMenu
      editor={editor}
      className={FLOATING_BAR_CLASS}
      shouldShow={({ state }) =>
        !state.selection.empty && !editor.isActive("image")
      }
    >
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
  onInsertImage,
}: {
  editor: Editor
  onInsertImage?: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Formatting options"
            className="text-subtle hover:text-text-muted"
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
        {onInsertImage ? (
          <ToolbarButton label="Insert image" onClick={onInsertImage}>
            <ImageIcon />
          </ToolbarButton>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Tiptap editor for note bodies. Saves JSON + plain text with a debounce;
 * read-only mode renders the same document without the formatting menus.
 * A compact bar provides block actions and a formatting menu; select text
 * for inline formatting or an image for its controls. Slash commands insert
 * blocks. The Docs host can enable export and writing-width controls.
 * Pasting or dropping an image uploads it (when
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
  draftKey,
  workspace = false,
  documentTitle = "Untitled",
  fullscreen,
  onFullscreen,
  onUploadStateChange,
  documentTheme,
  onDocumentThemeChange,
}: {
  content: Doc | null
  editable?: boolean
  onSave?: (doc: Doc, text: string) => void | Promise<void>
  /** Stable entity key for network autosave and recovery across editor unmounts. */
  draftKey?: string
  onUploadImage?: UploadImage
  onLinkPreview?: LinkPreview
  /** Delay before `onSave` fires after the last keystroke. 0 calls it
   * synchronously on every update — for a caller that only holds the
   * result locally (no network call) and needs it always current, e.g.
   * to read right before an explicit Save action. */
  debounceMs?: number
  /** Swaps the bordered-card look for a sunken background instead, for a
   * host (the Docs modal) that already provides its own chrome but
   * still wants the editable area visually set apart from it. */
  bare?: boolean
  workspace?: boolean
  documentTitle?: string
  fullscreen?: boolean
  onFullscreen?: () => void
  onUploadStateChange?: (pending: number) => void
  documentTheme?: DocumentTheme
  onDocumentThemeChange?: (theme: DocumentTheme) => void
}) {
  const sync = useSyncController()
  const instanceId = useId()
  const autosaveId = `autosave:${draftKey ?? instanceId}`
  const draft = useSyncExternalStore(
    sync.drafts.subscribe,
    () => (draftKey ? sync.drafts.get(draftKey) : undefined),
    () => undefined
  )
  const timer = useRef<number | undefined>(undefined)
  const slashKeyHandler = useRef<((event: KeyboardEvent) => boolean) | null>(
    null
  )
  const imageInput = useRef<HTMLInputElement>(null)
  const imageInsertPosition = useRef<number | undefined>(undefined)
  const pendingUploads = useRef(0)
  const [uploading, setUploading] = useState(false)
  const [writingWidth, setWritingWidth] = useState("wide")
  const uploadStateCallback = useRef(onUploadStateChange)
  const uploadImage = (
    editor: Editor,
    file: File,
    pos?: number,
    replaceSrc?: string
  ) => {
    const upload = onUploadImageRef.current
    if (!upload) return
    pendingUploads.current++
    setUploading(true)
    uploadStateCallback.current?.(pendingUploads.current)
    void uploadDocumentImage(editor, file, upload, pos, replaceSrc)
      .catch((error) =>
        toast.error(`Image upload failed: ${(error as Error).message}`)
      )
      .finally(() => {
        pendingUploads.current--
        if (!editor.isDestroyed) {
          setUploading(pendingUploads.current > 0)
          uploadStateCallback.current?.(pendingUploads.current)
        }
      })
  }
  const uploadImageRef = useRef(uploadImage)
  // Switching entities keeps the old flush callback bound to its original ID.
  const onSaveRef = useRef(onSave)
  const callbacks = useRef(new Map<string, NonNullable<typeof onSave>>())
  const onUploadImageRef = useRef(onUploadImage)
  const onLinkPreviewRef = useRef(onLinkPreview)
  useEffect(() => {
    onSaveRef.current = onSave
    if (draftKey && onSave) callbacks.current.set(draftKey, onSave)
    onUploadImageRef.current = onUploadImage
    onLinkPreviewRef.current = onLinkPreview
    uploadStateCallback.current = onUploadStateChange
    uploadImageRef.current = uploadImage
  })

  const [retrying, setRetrying] = useState(false)
  const saveDraft = (key: string) => {
    const save = callbacks.current.get(key)
    if (!save) return
    const saving = sync.drafts
      .save(key, (doc, text) => Promise.resolve(save(doc, text)))
      .then(() => {
        if (sync.drafts.get(key)?.phase === "saved") sync.resolveDraft(key)
      })
      .catch(() => {}) // Hooks and the recoverable draft status explain errors.
    sync.finish(`autosave:${key}`)
    return saving
  }
  const saveDraftRef = useRef(saveDraft)
  useEffect(() => {
    saveDraftRef.current = saveDraft
  })

  const editor: Editor | null = useEditor(
    {
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
        DocumentImage.configure({
          allowBase64: false,
          HTMLAttributes: { class: "rounded-lg max-w-full" },
        }),
        ImageUploads,
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: "Write something…" }),
      ],
      content: content ?? undefined,
      editorProps: {
        handleKeyDown: (view, event) => {
          if (event.isComposing) return false
          if (slashKeyHandler.current?.(event)) return true
          // Match a text editor: Tab inserts spaces instead of moving focus.
          // Shift+Tab and modified Tab retain their normal keyboard behaviour.
          if (
            view.editable &&
            event.key === "Tab" &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            view.state.selection instanceof TextSelection
          ) {
            event.preventDefault()
            view.dispatch(view.state.tr.insertText("    ").scrollIntoView())
            return true
          }
          return false
        },
        attributes: {
          class: cn(
            "prose-dark outline-none [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-subtle [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
            !workspace && "px-3 py-2",
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
              for (const file of images) uploadImageRef.current(editor!, file)
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
          const images = Array.from(event.dataTransfer?.files ?? []).filter(
            (f) => f.type.startsWith("image/")
          )
          if (!upload || !images.length) return false
          event.preventDefault()
          const pos = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })
          for (const file of images)
            uploadImageRef.current(editor!, file, pos?.pos)
          return true
        },
      },
      onUpdate: ({ editor }) => {
        if (hasTemporaryImages(editor.getJSON())) return
        const commit = () => {
          timer.current = undefined
          if (draftKey) {
            saveDraftRef.current(draftKey)
            return
          }
          onSaveRef.current?.(
            editor.getJSON() as Doc,
            editor.getText({ blockSeparator: "\n" })
          )
          // The mutation bridge registers the write before removing the queued save.
          sync.finish(autosaveId)
        }
        window.clearTimeout(timer.current)
        if (draftKey)
          sync.drafts.edit(
            draftKey,
            editor.getJSON() as Doc,
            editor.getText({ blockSeparator: "\n" })
          )
        if (debounceMs <= 0) {
          commit()
          return
        }
        if (!onSaveRef.current) return
        sync.queue("Saving note", autosaveId, draftKey ? [draftKey] : [])
        timer.current = window.setTimeout(commit, debounceMs)
      },
    },
    [draftKey]
  )

  const previousFullscreen = useRef(fullscreen)
  useEffect(() => {
    if (previousFullscreen.current === fullscreen) return
    previousFullscreen.current = fullscreen
    editor?.commands.focus(undefined, { scrollIntoView: false })
  }, [editor, fullscreen])

  useEffect(() => {
    if (
      editor &&
      draft?.doc &&
      JSON.stringify(editor.getJSON()) !== JSON.stringify(draft.doc)
    ) {
      editor.commands.setContent(draft.doc, { emitUpdate: false })
    }
  }, [editor, draft])

  // Flush a pending save when the editor unmounts (drawer closed quickly).
  useEffect(() => {
    const entityCallbacks = callbacks.current
    return () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current)
        timer.current = undefined
        if (draftKey) saveDraftRef.current(draftKey)
        else if (editor && !editor.isDestroyed)
          onSaveRef.current?.(
            editor.getJSON() as Doc,
            editor.getText({ blockSeparator: "\n" })
          )
      }
      sync.finish(autosaveId)
      if (draftKey) entityCallbacks.delete(draftKey)
    }
  }, [editor, sync, autosaveId, draftKey, onSaveRef, saveDraftRef])

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
      onKeyDown={(event) => {
        if (
          !editable ||
          event.defaultPrevented ||
          !(event.ctrlKey || event.metaKey)
        )
          return
        const target = event.target as HTMLElement
        if (
          target.closest(".tiptap") ||
          target.matches("input, textarea, select")
        )
          return
        const key = event.key.toLowerCase()
        if (key !== "z" && key !== "y") return
        event.preventDefault()
        if (key === "y" || event.shiftKey) editor.chain().focus().redo().run()
        else editor.chain().focus().undo().run()
      }}
      className={cn(
        "relative overflow-hidden rounded-lg transition-colors",
        bare && "flex h-full min-h-0 flex-col",
        editable &&
          (bare
            ? "bg-bg-sunken ring-1 ring-transparent focus-within:ring-border-strong"
            : "border border-border bg-surface focus-within:border-border-strong"),
        fullscreen && "rounded-none ring-0 focus-within:ring-0"
      )}
    >
      {draftKey && (draft?.phase === "failed" || retrying) ? (
        <div
          className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-text-muted"
          role="status"
          aria-live="polite"
        >
          <span>Couldn&apos;t save. Your draft is kept in this session.</span>
          {draft?.phase === "failed" || retrying ? (
            <>
              <Button
                size="xs"
                variant="outline"
                loading={retrying}
                onClick={() => {
                  setRetrying(true)
                  void Promise.resolve(saveDraft(draftKey)).finally(() =>
                    setRetrying(false)
                  )
                }}
              >
                Retry save
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={retrying}
                onClick={() => {
                  sync.drafts.discard(draftKey)
                  sync.resolveDraft(draftKey)
                  editor.commands.setContent(
                    content ?? { type: "doc", content: [] },
                    { emitUpdate: false }
                  )
                }}
              >
                Discard draft
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {editable ? (
        <>
          <SelectionMenu editor={editor} />
          <div
            role="toolbar"
            aria-label="Document toolbar"
            className={cn(
              "flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5",
              fullscreen && "hidden"
            )}
          >
            <BlockActions editor={editor} />
            <span className="min-w-0 flex-1 text-center text-xs text-subtle">
              <span className="hidden sm:inline">
                {uploading ? "Uploading images…" : "Type / to insert a block"}
              </span>
            </span>
            {workspace && (
              <WorkspaceControls
                editor={editor}
                title={documentTitle}
                width={writingWidth}
                onWidth={setWritingWidth}
                fullscreen={fullscreen}
                onFullscreen={onFullscreen}
                uploading={uploading}
                theme={documentTheme}
                onThemeChange={onDocumentThemeChange}
              />
            )}
            <FormattingMenu
              editor={editor}
              onInsertImage={
                onUploadImage
                  ? () => {
                      imageInsertPosition.current = editor.state.selection.from
                      imageInput.current?.click()
                    }
                  : undefined
              }
            />
          </div>
          <div className={cn(fullscreen && "hidden")}>
            <ImageControls
              editor={editor}
              onReplace={
                onUploadImage
                  ? (file, pos, src) => uploadImage(editor, file, pos, src)
                  : undefined
              }
            />
          </div>
          <SlashMenu
            editor={editor}
            keyHandlerRef={slashKeyHandler}
            onImage={
              onUploadImage
                ? () => {
                    imageInsertPosition.current = editor.state.selection.from
                    imageInput.current?.click()
                  }
                : undefined
            }
          />
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Insert image file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) uploadImage(editor, file, imageInsertPosition.current)
            }}
          />
        </>
      ) : null}
      <EditorContent
        editor={editor}
        className={cn(
          bare && "min-h-0 flex-1 overflow-y-auto",
          workspace && "document-writing-area",
          fullscreen && "document-fullscreen-area",
          workspace &&
            (writingWidth === "narrow"
              ? "document-width-narrow"
              : writingWidth === "wide"
                ? "document-width-wide"
                : "document-width-comfortable")
        )}
      />
    </div>
  )
}
