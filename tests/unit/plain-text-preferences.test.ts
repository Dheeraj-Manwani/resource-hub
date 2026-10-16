import { describe, expect, it } from "vitest"
import { EditorSelection, EditorState } from "@codemirror/state"
import {
  defaultPlainTextPreferences,
  plainTextPreferencesSchema,
  plainTextTab,
} from "@/lib/docs/plain-text-preferences"

describe("plain-text indentation", () => {
  it("inserts literal tabs without converting existing whitespace", () => {
    const state = EditorState.create({
      doc: "  text",
      selection: { anchor: 2 },
    })
    expect(
      state
        .update(plainTextTab(state, defaultPlainTextPreferences))
        .state.doc.toString()
    ).toBe("  \ttext")
  })
  it("inserts spaces to the next tab stop, including after existing tabs and Unicode", () => {
    for (const [doc, expected] of [
      ["a", "a   "],
      ["ab", "ab  "],
      ["abcd", "abcd    "],
      ["\ta", "\ta   "],
      ["👋", "👋   "],
      ["e\u0301", "e\u0301   "],
    ]) {
      const state = EditorState.create({
        doc,
        selection: { anchor: doc.length },
      })
      expect(
        state
          .update(
            plainTextTab(state, {
              ...defaultPlainTextPreferences,
              indent: "spaces",
            })
          )
          .state.doc.toString()
      ).toBe(expected)
    }
  })
  it("replaces selected text and maps multiple cursor positions", () => {
    const state = EditorState.create({
      doc: "ab\ncd",
      selection: EditorSelection.create([
        EditorSelection.range(1, 2),
        EditorSelection.cursor(5),
      ]),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    })
    const next = state.update(
      plainTextTab(state, {
        ...defaultPlainTextPreferences,
        indent: "spaces",
        tabSize: 2,
      })
    ).state
    expect(next.doc.toString()).toBe("a \ncd  ")
    expect(next.selection.ranges.map((range) => range.head)).toEqual([2, 7])
  })
  it("validates stored preferences before using them", () => {
    expect(
      plainTextPreferencesSchema.safeParse(defaultPlainTextPreferences).success
    ).toBe(true)
    for (const value of [
      null,
      {},
      { ...defaultPlainTextPreferences, wrap: "true" },
      { ...defaultPlainTextPreferences, tabSize: 0 },
      { ...defaultPlainTextPreferences, indent: "arbitrary" },
    ])
      expect(plainTextPreferencesSchema.safeParse(value).success).toBe(false)
  })
})
