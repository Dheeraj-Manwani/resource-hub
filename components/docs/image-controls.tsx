"use client"

/* eslint-disable @next/next/no-img-element -- Uploaded document images use authenticated URLs and native sizing. */
import { useEditorState, type Editor } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"
import { closeHistory } from "@tiptap/pm/history"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { imageDimension } from "@/lib/docs/text-document"
import { moveSelectedImage } from "./block-actions"

export function ImageControls({
  editor,
  onReplace,
}: {
  editor: Editor
  onReplace?: (file: File, pos: number, src: string) => void
}) {
  const selected = useEditorState({
    editor,
    selector: ({ editor }) => {
      const selection = editor.state.selection
      return selection instanceof NodeSelection &&
        selection.node.type.name === "image"
        ? { pos: selection.from, attrs: selection.node.attrs }
        : null
    },
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const [sizeOpen, setSizeOpen] = useState(false)
  const replacement = useRef<{ pos: number; src: string } | null>(null)
  const [details, setDetails] = useState<{
    pos: number
    src: string
    alt: string
    caption: string
  } | null>(null)
  const [preview, setPreview] = useState<{
    src: string
    alt: string
    caption: string
  } | null>(null)
  const update = (attrs: Record<string, unknown>) => {
    if (!selected) return
    const current = editor.state.doc.nodeAt(selected.pos)
    if (current?.type.name !== "image") return
    editor.view.dispatch(
      closeHistory(editor.state.tr).setNodeMarkup(selected.pos, undefined, {
        ...current.attrs,
        ...attrs,
      })
    )
    editor.view.focus()
  }
  const resize = (width: number | null, full = false) => {
    if (!selected) return
    const element = editor.view.nodeDOM(selected.pos) as HTMLElement | null
    const image = element?.querySelector("img")
    const oldWidth = imageDimension(selected.attrs.width) ?? image?.naturalWidth
    const oldHeight =
      imageDimension(selected.attrs.height) ?? image?.naturalHeight
    const height =
      width && oldWidth && oldHeight
        ? Math.round((width * oldHeight) / oldWidth)
        : null
    update({ width, height, widthMode: full ? "full" : "fixed" })
    setSizeOpen(false)
  }
  return (
    <>
      {selected && (
        <div
          className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2"
          aria-label="Image controls"
        >
          <span className="mr-1 text-xs text-text-muted">Image</span>
          <Popover open={sizeOpen} onOpenChange={setSizeOpen}>
            <PopoverTrigger render={<Button size="xs" variant="outline" />}>
              Size
            </PopoverTrigger>
            <PopoverContent
              className="w-40 gap-1"
              align="start"
              finalFocus={() => editor.view.dom}
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  resize(Math.min(240, editor.view.dom.clientWidth - 24))
                }
              >
                Small
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  resize(Math.min(480, editor.view.dom.clientWidth - 24))
                }
              >
                Medium
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resize(null, true)}
              >
                Full width
              </Button>
              <Button size="sm" variant="ghost" onClick={() => resize(null)}>
                Reset size
              </Button>
            </PopoverContent>
          </Popover>
          {(["left", "center", "right"] as const).map((alignment) => (
            <Button
              key={alignment}
              size="xs"
              variant="ghost"
              aria-label={`Align image ${alignment}`}
              aria-pressed={selected.attrs.alignment === alignment}
              onClick={() => update({ alignment })}
            >
              {alignment[0].toUpperCase() + alignment.slice(1)}
            </Button>
          ))}
          <Button
            size="xs"
            variant="ghost"
            disabled={editor.state.selection.$from.index() === 0}
            onClick={() => moveSelectedImage(editor, -1)}
          >
            Move image up
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={
              editor.state.selection.$from.index() ===
              editor.state.selection.$from.parent.childCount - 1
            }
            onClick={() => moveSelectedImage(editor, 1)}
          >
            Move image down
          </Button>
          {onReplace && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                replacement.current = {
                  pos: selected.pos,
                  src: selected.attrs.src,
                }
                fileInput.current?.click()
              }}
            >
              Replace image
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              setDetails({
                pos: selected.pos,
                src: selected.attrs.src,
                alt: selected.attrs.alt ?? "",
                caption: selected.attrs.caption ?? "",
              })
            }
          >
            Caption &amp; alt text
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              setPreview({
                src: selected.attrs.src,
                alt: selected.attrs.alt ?? "",
                caption: selected.attrs.caption ?? "",
              })
            }
          >
            Preview image
          </Button>
          <Button
            size="xs"
            variant="destructive"
            onClick={() => editor.chain().focus().deleteSelection().run()}
          >
            Delete image
          </Button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Replace image file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          const target = replacement.current
          replacement.current = null
          if (file && target) onReplace?.(file, target.pos, target.src)
        }}
      />
      <Dialog
        open={Boolean(details)}
        onOpenChange={(open) => {
          if (!open) setDetails(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Image details</DialogTitle>
            <DialogDescription>
              Add a visible caption and a description for screen readers.
            </DialogDescription>
          </DialogHeader>
          {details && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const current = editor.state.doc.nodeAt(details.pos)
                if (
                  current?.type.name === "image" &&
                  current.attrs.src === details.src
                )
                  editor.view.dispatch(
                    closeHistory(editor.state.tr).setNodeMarkup(
                      details.pos,
                      undefined,
                      {
                        ...current.attrs,
                        alt: details.alt,
                        caption: details.caption,
                      }
                    )
                  )
                setDetails(null)
                editor.view.focus()
              }}
              className="flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1 text-sm">
                Caption
                <Input
                  autoFocus
                  value={details.caption}
                  maxLength={1000}
                  onChange={(e) =>
                    setDetails({ ...details, caption: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Alt text
                <Input
                  value={details.alt}
                  maxLength={1000}
                  onChange={(e) =>
                    setDetails({ ...details, alt: e.target.value })
                  }
                />
              </label>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDetails(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">Apply image details</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Image preview</DialogTitle>
            <DialogDescription>
              {preview?.caption || preview?.alt || "Full-size document image"}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <img
              src={preview.src}
              alt={preview.alt}
              className="mx-auto max-h-[70vh] max-w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
