import { describe, expect, it } from "vitest"
import { EditorSelection, EditorState } from "@codemirror/state"
import { history, undo } from "@codemirror/commands"
import {
  plainTextLineAction,
  singlePlainTextCursor,
  type PlainTextLineAction,
} from "@/lib/docs/plain-text-editing"

function document(text: string, lines: number[], readOnly = false) {
  let state = EditorState.create({
    doc: text,
    extensions: [
      history(),
      EditorState.lineSeparator.of("\n"),
      EditorState.allowMultipleSelections.of(true),
      EditorState.readOnly.of(readOnly),
    ],
  })
  state = state.update({
    selection: EditorSelection.create(
      lines.map((line) => EditorSelection.cursor(state.doc.line(line).from)),
      lines.length - 1
    ),
  }).state
  return state
}
function run(state: EditorState, action: PlainTextLineAction) {
  let next = state
  const changed = plainTextLineAction(action)({
    state,
    dispatch: (transaction) => {
      next = transaction.state
    },
  })
  return { state: next, changed }
}

describe("plain-text line editing", () => {
  it("returns to exactly one caret at the main head without changing text", () => {
    let state = document("abc\ndef", [1, 2])
    state = state.update({
      selection: EditorSelection.create(
        [EditorSelection.range(0, 2), EditorSelection.range(4, 7)],
        1
      ),
    }).state
    let next = state
    singlePlainTextCursor({
      state,
      dispatch: (transaction) => {
        next = transaction.state
      },
    })
    expect(next.doc.toString()).toBe("abc\ndef")
    expect(next.selection.ranges).toHaveLength(1)
    expect(next.selection.main.empty).toBe(true)
    expect(next.selection.main.head).toBe(7)
  })
  it("moves logical lines, including blank lines and Unicode, with undo", () => {
    const initial = document("one\n\ntwo👋\nlast", [3])
    const next = run(initial, "moveUp").state
    expect(next.doc.toString()).toBe("one\ntwo👋\n\nlast")
    expect(next.doc.lineAt(next.selection.main.head).number).toBe(2)
    let restored = next
    undo({
      state: next,
      dispatch: (transaction) => {
        restored = transaction.state
      },
    })
    expect(restored.doc.toString()).toBe(initial.doc.toString())
  })
  it("duplicates a selected block once and excludes an endpoint at the next line's start", () => {
    let state = document("one\ntwo\nthree", [1])
    state = state.update({
      selection: { anchor: 0, head: state.doc.line(3).from },
    }).state
    expect(run(state, "duplicateDown").state.doc.toString()).toBe(
      "one\ntwo\none\ntwo\nthree"
    )
  })
  it("handles separate cursors without duplicating the same line twice", () => {
    const initial = document("one\ntwo\nthree", [1, 3])
    const next = run(initial, "duplicateDown").state
    expect(next.doc.toString()).toBe("one\none\ntwo\nthree\nthree")
    expect(next.selection.ranges).toHaveLength(2)
    const sameLine = initial.update({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(2),
      ]),
    }).state
    expect(run(sameLine, "duplicateDown").state.doc.toString()).toBe(
      "one\none\ntwo\nthree"
    )
  })
  it("keeps CRLF separators intact and a file BOM at the start through line actions", () => {
    const text = "\ufeffα\r\nβ\r\nlast"
    expect(run(document(text, [3]), "moveUp").state.doc.toString()).toBe(
      "\ufeffα\r\nlast\r\nβ"
    )
    const duplicated = run(document(text, [1]), "duplicateUp").state
    expect(duplicated.doc.toString()).toBe("\ufeffα\r\nα\r\nβ\r\nlast")
    expect(duplicated.selection.main.head).toBe(1)
    expect(run(document(text, [3]), "duplicateDown").state.doc.toString()).toBe(
      "\ufeffα\r\nβ\r\nlast\r\nlast"
    )
  })
  it("retains mixed separators at their rows when moving and retains old separators when copying", () => {
    const text = "first\r\nsecond\nthird"
    expect(run(document(text, [1]), "moveDown").state.doc.toString()).toBe(
      "second\r\nfirst\nthird"
    )
    expect(run(document(text, [2]), "duplicateDown").state.doc.toString()).toBe(
      "first\r\nsecond\nsecond\nthird"
    )
  })
  it("does not edit read-only docs or move past document edges", () => {
    for (const action of [
      "moveUp",
      "moveDown",
      "duplicateUp",
      "duplicateDown",
    ] as const)
      expect(run(document("a\nb", [1], true), action).changed).toBe(false)
    expect(run(document("a\nb", [1]), "moveUp").changed).toBe(false)
    expect(run(document("a\nb", [2]), "moveDown").changed).toBe(false)
    const cursors = document("a\nb\nc", [1, 3])
    for (const action of ["moveUp", "moveDown"] as const) {
      const next = run(cursors, action)
      expect(next.changed).toBe(false)
      expect(next.state.selection.ranges).toHaveLength(2)
    }
  })
  it("copies the internal separators of a mixed-ending selected block exactly", () => {
    let state = document("one\r\ntwo\nthree", [1])
    state = state.update({
      selection: { anchor: 0, head: state.doc.line(3).from },
    }).state
    for (const action of ["duplicateUp", "duplicateDown"] as const)
      expect(run(state, action).state.doc.toString()).toBe(
        "one\r\ntwo\none\r\ntwo\nthree"
      )
  })
  it("keeps a small line move's undo payload small in a larger CRLF file", () => {
    const state = document(
      "first\r\nsecond\r\n" + "tail\r\n".repeat(10_000),
      [2]
    )
    let changedSize = 0
    plainTextLineAction("moveUp")({
      state,
      dispatch: (transaction) => {
        transaction.changes.iterChanges((from, to, _fromB, _toB, insert) => {
          changedSize += to - from + insert.length
        })
        expect(transaction.state.doc.line(1).text).toBe("second\r")
      },
    })
    expect(changedSize).toBeLessThan(100)
  })
})
