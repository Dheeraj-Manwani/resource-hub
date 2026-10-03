"use client"

import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  Heading2Icon,
  ItalicIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Doc = Record<string, unknown>

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

function Toolbar({ editor }: { editor: Editor }) {
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
    </div>
  )
}

/**
 * Tiptap editor for note bodies. Saves JSON + plain text with a debounce;
 * read-only mode renders the same document without the toolbar.
 */
export default function NoteEditor({
  content,
  editable = true,
  onSave,
}: {
  content: Doc | null
  editable?: boolean
  onSave?: (doc: Doc, text: string) => void
}) {
  const timer = useRef<number | undefined>(undefined)
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
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
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Write something…" }),
    ],
    content: content ?? undefined,
    editorProps: {
      attributes: {
        class:
          "prose-dark min-h-40 px-3 py-2 outline-none [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-subtle [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
      },
    },
    onUpdate: ({ editor }) => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        onSaveRef.current?.(
          editor.getJSON() as Doc,
          editor.getText({ blockSeparator: "\n" })
        )
      }, 800)
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
      <div className="min-h-40 rounded-lg border border-border bg-surface" />
    )
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg",
        editable &&
          "border border-border bg-surface focus-within:border-border-strong"
      )}
    >
      {editable ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}
