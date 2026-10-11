import { describe, expect, it, vi } from "vitest"
import { getSchema, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state"
import { history, undo, redo } from "@tiptap/pm/history"
import { DocumentImage } from "@/components/docs/document-image"
import {
  currentBlock,
  deleteBlock,
  duplicateBlock,
  moveBlock,
  moveSelectedImage,
} from "@/components/docs/block-actions"
import {
  documentFilename,
  hasTemporaryImages,
  imageDimension,
  textDocumentMarkdown,
} from "@/lib/docs/text-document"

const schema = getSchema([StarterKit, DocumentImage])
const paragraph = (text: string) =>
  schema.nodes.paragraph.create(null, schema.text(text))
const image = schema.nodes.image.create({
  src: "https://example.com/picture.png",
  width: 320,
  height: 200,
  alignment: "center",
  caption: "A caption",
  alt: "A description",
})
function editorFixture(nested = false) {
  const content = [paragraph("Before"), image, paragraph("After")]
  const doc = schema.nodes.doc.create(
    null,
    nested ? [schema.nodes.blockquote.create(null, content)] : content
  )
  let state = EditorState.create({
    schema,
    doc,
    selection: NodeSelection.create(doc, nested ? 9 : 8),
    plugins: [history()],
  })
  const editor = {
    get state() {
      return state
    },
    view: {
      dispatch: (tr: Parameters<EditorState["apply"]>[0]) => {
        state = state.apply(tr)
      },
      focus: vi.fn(),
    },
  } as unknown as Editor
  return editor
}

describe("document image and block history", () => {
  it("moves an image within a quote without moving the containing quote", () => {
    const editor = editorFixture(true)
    moveSelectedImage(editor, 1)
    expect(editor.state.doc.child(0).type.name).toBe("blockquote")
    expect(editor.state.doc.child(0).child(2).attrs).toMatchObject({
      caption: "A caption",
      width: 320,
    })
    undo(editor.state, editor.view.dispatch)
    expect(editor.state.doc.child(0).child(1).type.name).toBe("image")
  })
  it("moves an image without losing attributes, and undo/redo restores the complete document", () => {
    const editor = editorFixture()
    const original = editor.state.doc.toJSON()
    moveBlock(editor, 1)
    expect(editor.state.doc.child(2).attrs).toMatchObject({
      alignment: "center",
      caption: "A caption",
      width: 320,
      height: 200,
    })
    expect(editor.state.doc.child(1).textContent).toBe("After")
    undo(editor.state, editor.view.dispatch)
    expect(editor.state.doc.toJSON()).toEqual(original)
    redo(editor.state, editor.view.dispatch)
    expect(currentBlock(editor).index).toBe(2)
    moveBlock(editor, -1)
    expect(editor.state.doc.toJSON()).toEqual(original)
  })
  it("duplicates and deletes whole image nodes", () => {
    const editor = editorFixture()
    duplicateBlock(editor)
    expect(editor.state.doc.child(2).toJSON()).toEqual(image.toJSON())
    deleteBlock(editor)
    expect(editor.state.doc.childCount).toBe(3)
    expect(editor.state.doc.child(1).type.name).toBe("image")
  })
  it("targets the final block when the cursor sits at the end of the document", () => {
    const editor = editorFixture()
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.near(
          editor.state.doc.resolve(editor.state.doc.content.size)
        )
      )
    )
    expect(currentBlock(editor).node.textContent).toBe("After")
    moveBlock(editor, 1)
    expect(editor.state.doc.childCount).toBe(3)
  })
})

describe("portable document export", () => {
  it("exports formatting, nested lists, images and captions without interpreting user text as HTML", () => {
    const result = textDocumentMarkdown(
      {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Details" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "<script>*literal*</script>",
                marks: [{ type: "bold" }],
              },
            ],
          },
          {
            type: "orderedList",
            attrs: { start: 3 },
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Step" }],
                  },
                  {
                    type: "bulletList",
                    content: [
                      {
                        type: "listItem",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Nested" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          image.toJSON(),
        ],
      },
      "My document"
    )
    expect(result).toContain("# My document\n\n## Details")
    expect(result).toContain("\\<script\\>\\*literal\\*")
    expect(result).toContain("3. Step\n   \n   - Nested")
    expect(result).toContain(
      "![A description](https://example.com/picture.png)\n\n*A caption*"
    )
  })
  it("rejects executable links and temporary images, escapes URL syntax and code fences", () => {
    const markdown = textDocumentMarkdown({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
        { type: "image", attrs: { src: "blob:temporary" } },
        { type: "image", attrs: { src: "https://example.com/a(b).png" } },
        { type: "codeBlock", content: [{ type: "text", text: "```\ncode" }] },
      ],
    })
    expect(markdown).not.toContain("javascript:")
    expect(markdown).not.toContain("blob:")
    expect(markdown).toContain("a%28b%29.png")
    expect(markdown).toContain("````\n```\ncode\n````")
  })
  it("detects nested temporary images and clamps invalid dimensions and filenames", () => {
    expect(
      hasTemporaryImages({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [{ type: "image", attrs: { src: "blob:pending" } }],
          },
        ],
      })
    ).toBe(true)
    expect(hasTemporaryImages(image.toJSON())).toBe(false)
    expect(imageDimension(-1)).toBeNull()
    expect(imageDimension("bad")).toBeNull()
    expect(imageDimension(999999)).toBe(10000)
    expect(documentFilename("a/b:c?")).toBe("a-b-c-.md")
  })
})
