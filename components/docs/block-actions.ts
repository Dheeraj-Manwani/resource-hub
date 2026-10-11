import type { Editor } from "@tiptap/react"
import {
  DOMSerializer,
  Slice,
  Fragment,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { closeHistory } from "@tiptap/pm/history"

export function currentBlock(editor: Editor) {
  const { $from } = editor.state.selection
  const index = Math.min($from.index(0), editor.state.doc.childCount - 1)
  const node = editor.state.doc.child(index)
  let pos = $from.depth ? $from.before(1) : 0
  if (!$from.depth)
    for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize
  return { node, pos, index }
}

export function moveBlock(editor: Editor, direction: -1 | 1) {
  const { node, pos, index } = currentBlock(editor)
  moveSibling(editor, node, pos, index, editor.state.doc, direction)
}

export function moveSelectedImage(editor: Editor, direction: -1 | 1) {
  const selection = editor.state.selection
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type.name !== "image"
  )
    return
  moveSibling(
    editor,
    selection.node,
    selection.from,
    selection.$from.index(),
    selection.$from.parent,
    direction
  )
}

function moveSibling(
  editor: Editor,
  node: ProseMirrorNode,
  pos: number,
  index: number,
  parent: ProseMirrorNode,
  direction: -1 | 1
) {
  const neighborIndex = index + direction
  if (neighborIndex < 0 || neighborIndex >= parent.childCount) return
  const neighbor = parent.child(neighborIndex)
  const target =
    direction < 0 ? pos - neighbor.nodeSize : pos + neighbor.nodeSize
  const tr = closeHistory(editor.state.tr)
    .delete(pos, pos + node.nodeSize)
    .insert(target, node)
  editor.view.dispatch(
    tr.setSelection(NodeSelection.create(tr.doc, target)).scrollIntoView()
  )
  editor.view.focus()
}

export function duplicateBlock(editor: Editor) {
  const { node, pos } = currentBlock(editor)
  const target = pos + node.nodeSize
  const tr = closeHistory(editor.state.tr).insert(target, node)
  editor.view.dispatch(
    tr.setSelection(NodeSelection.create(tr.doc, target)).scrollIntoView()
  )
  editor.view.focus()
}

export function deleteBlock(editor: Editor) {
  const { node, pos } = currentBlock(editor)
  editor.view.dispatch(
    closeHistory(editor.state.tr)
      .delete(pos, pos + node.nodeSize)
      .scrollIntoView()
  )
  editor.view.focus()
}

export type BlockKind =
  | "paragraph"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
export const blockChoices: { kind: BlockKind; label: string }[] = [
  { kind: "paragraph", label: "Text" },
  { kind: "heading", label: "Heading" },
  { kind: "bulletList", label: "Bullet list" },
  { kind: "orderedList", label: "Numbered list" },
  { kind: "taskList", label: "Checklist" },
  { kind: "blockquote", label: "Quote" },
  { kind: "codeBlock", label: "Code block" },
]

export function convertBlock(editor: Editor, kind: BlockKind) {
  const { node, pos } = currentBlock(editor)
  if (node.type.name === "image" || node.type.name === "horizontalRule") return
  const selection = TextSelection.between(
    editor.state.doc.resolve(pos + 1),
    editor.state.doc.resolve(pos + node.nodeSize - 1)
  )
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  const chain = editor.chain().focus()
  if (kind === "paragraph") chain.clearNodes().setParagraph().run()
  if (kind === "heading") chain.clearNodes().setHeading({ level: 2 }).run()
  if (kind === "codeBlock") chain.clearNodes().setCodeBlock().run()
  if (kind === "bulletList" && !editor.isActive(kind))
    chain.toggleBulletList().run()
  if (kind === "orderedList" && !editor.isActive(kind))
    chain.toggleOrderedList().run()
  if (kind === "taskList" && !editor.isActive(kind))
    chain.toggleTaskList().run()
  if (kind === "blockquote" && !editor.isActive(kind))
    chain.toggleBlockquote().run()
}

export function dragBlock(editor: Editor, event: React.DragEvent) {
  const { node, pos } = currentBlock(editor)
  const slice = new Slice(Fragment.from(node), 0, 0)
  const wrapper = document.createElement("div")
  wrapper.append(
    DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content)
  )
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData("text/html", wrapper.innerHTML)
  event.dataTransfer.setData(
    "text/plain",
    node.textContent || String(node.attrs.alt ?? "Image")
  )
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))
  )
  editor.view.dragging = { slice, move: true }
}

export function finishBlockDrag(editor: Editor) {
  if (!editor.isDestroyed) editor.view.dragging = null
}
