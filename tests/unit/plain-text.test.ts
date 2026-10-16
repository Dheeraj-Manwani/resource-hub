import { describe, expect, it } from "vitest"
import { EditorState } from "@codemirror/state"
import {
  isPlainTextDocument,
  plainTextFormat,
  plainTextBodySchema,
  richDocumentText,
} from "@/lib/docs/plain-text"

describe("plain-text documents", () => {
  it("distinguishes versioned plain text from existing rich text without inspecting its content", () => {
    expect(isPlainTextDocument(plainTextFormat())).toBe(true)
    for (const value of [
      null,
      { type: "doc", content: [] },
      { type: "plainText", version: 2 },
      { ...plainTextFormat(), content: [] },
    ])
      expect(isPlainTextDocument(value)).toBe(false)
  })
  it("preserves literal markup, URLs, Unicode and all whitespace through editor serialization", () => {
    for (const text of [
      "\n\n\t# Heading  \n- list\nhttps://example.com\n\n",
      "a\r\nb\r\n",
      "  café हिन्दी 👋\t\n",
      "\n",
      "",
    ]) {
      expect(plainTextBodySchema.parse(text)).toBe(text)
      const state = EditorState.create({
        doc: text,
        extensions: [EditorState.lineSeparator.of("\n")],
      })
      expect(state.doc.toString()).toBe(text)
      expect(
        EditorState.fromJSON(state.toJSON(), {
          extensions: [EditorState.lineSeparator.of("\n")],
        }).doc.toString()
      ).toBe(text)
    }
  })
  it("bounds saved content by UTF-8 bytes", () => {
    expect(plainTextBodySchema.safeParse("a".repeat(3_000_000)).success).toBe(
      true
    )
    expect(plainTextBodySchema.safeParse("é".repeat(1_500_001)).success).toBe(
      false
    )
  })
  it("extracts readable content for copies without changing the formatted source", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [
            { type: "text", text: "Heading", marks: [{ type: "bold" }] },
          ],
        },
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Keep  spaces\t" },
            { type: "hardBreak" },
            { type: "text", text: "Next" },
          ],
        },
        { type: "image", attrs: { src: "/picture.png", caption: "Caption" } },
      ],
    }
    const original = JSON.stringify(doc)
    expect(richDocumentText(doc)).toBe(
      "Heading\n\nKeep  spaces\t\nNext\nCaption"
    )
    expect(JSON.stringify(doc)).toBe(original)
  })
})
