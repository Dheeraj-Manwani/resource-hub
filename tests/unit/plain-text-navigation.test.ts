import { describe, expect, it } from "vitest"
import { EditorSelection, EditorState } from "@codemirror/state"
import {
  parseLineNumber,
  plainTextPosition,
} from "@/lib/docs/plain-text-navigation"

describe("plain-text navigation", () => {
  it("counts empty documents, blank lines and a trailing newline as logical lines", () => {
    expect(plainTextPosition(EditorState.create())).toEqual({
      line: 1,
      column: 1,
      lines: 1,
      selected: 0,
      selections: 1,
    })
    const doc = "first\n\nlast\n"
    expect(
      plainTextPosition(
        EditorState.create({ doc, selection: { anchor: doc.length } })
      )
    ).toEqual({
      line: 4,
      column: 1,
      lines: 4,
      selected: 0,
      selections: 1,
    })
  })

  it("counts graphemes rather than UTF-16 units for cursor columns and selections", () => {
    const doc = "\ne\u0301👨‍👩‍👧‍👦\t👍🏽"
    const state = EditorState.create({
      doc,
      selection: { anchor: 1, head: doc.length },
    })
    expect(plainTextPosition(state)).toEqual({
      line: 2,
      column: 5,
      lines: 2,
      selected: 4,
      selections: 1,
    })
    expect(
      plainTextPosition(
        state.update({ selection: { anchor: doc.length, head: 1 } }).state
      )
    ).toEqual({
      line: 2,
      column: 1,
      lines: 2,
      selected: 4,
      selections: 1,
    })
  })

  it("sums disjoint selections and uses the main cursor position", () => {
    const state = EditorState.create({
      doc: "a👋\n\nend",
      selection: EditorSelection.create(
        [EditorSelection.range(0, 3), EditorSelection.range(5, 8)],
        1
      ),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    })
    expect(plainTextPosition(state)).toEqual({
      line: 3,
      column: 4,
      lines: 3,
      selected: 5,
      selections: 2,
    })
  })

  it("rejects invalid and out-of-range line input without silently clamping", () => {
    expect(parseLineNumber(" 2 ", 3)).toBe(2)
    expect(parseLineNumber("01", 3)).toBe(1)
    expect(parseLineNumber("3", 3)).toBe(3)
    for (const value of [
      "",
      " ",
      "0",
      "-1",
      "4",
      "1.5",
      "1e0",
      "1:2",
      "Infinity",
      "9007199254740993",
    ])
      expect(parseLineNumber(value, 3)).toBeNull()
  })
})
