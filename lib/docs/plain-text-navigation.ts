import type { EditorState } from "@codemirror/state"

const characters = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function characterCount(text: string) {
  let count = 0
  const segments = characters.segment(text)[Symbol.iterator]()
  while (!segments.next().done) count++
  return count
}

export function plainTextPosition(state: EditorState) {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  return {
    line: line.number,
    column: characterCount(state.sliceDoc(line.from, head)) + 1,
    lines: state.doc.lines,
    selections: state.selection.ranges.length,
    selected: state.selection.ranges.reduce(
      (count, range) =>
        count + characterCount(state.sliceDoc(range.from, range.to)),
      0
    ),
  }
}

export function parseLineNumber(value: string, lines: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const line = Number(value.trim())
  return Number.isSafeInteger(line) && line >= 1 && line <= lines ? line : null
}
