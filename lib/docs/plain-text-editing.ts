import {
  EditorSelection,
  EditorState,
  Transaction,
  type StateCommand,
} from "@codemirror/state"
import {
  copyLineDown,
  copyLineUp,
  moveLineDown,
  moveLineUp,
  isolateHistory,
} from "@codemirror/commands"

export type PlainTextLineAction =
  "duplicateDown" | "duplicateUp" | "moveUp" | "moveDown"
const commands: Record<PlainTextLineAction, StateCommand> = {
  duplicateDown: copyLineDown,
  duplicateUp: copyLineUp,
  moveUp: moveLineUp,
  moveDown: moveLineDown,
}

export const singlePlainTextCursor: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.length === 1 && state.selection.main.empty)
    return false
  dispatch(
    state.update({
      selection: EditorSelection.cursor(state.selection.main.head),
      scrollIntoView: true,
      userEvent: "select",
    })
  )
  return true
}

/** Keep the file BOM at the start and CRLF separators out of line contents. */
export function plainTextLineAction(action: PlainTextLineAction): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly) return false
    // Treat a boundary as a no-op for the entire move rather than dropping
    // cursors from the blocks that cannot move further.
    if (
      action === "moveUp" &&
      state.doc.lineAt(state.selection.ranges[0].from).number === 1
    )
      return false
    const last = state.selection.ranges[state.selection.ranges.length - 1]
    const lastLine = state.doc.lineAt(last.to)
    const end =
      !last.empty && last.to === lastLine.from
        ? state.doc.lineAt(last.to - 1)
        : lastLine
    if (action === "moveDown" && end.number === state.doc.lines) return false
    const command = commands[action]
    const text = state.doc.toString()
    const isolatedDispatch: typeof dispatch = (transaction) =>
      dispatch(
        state.update({
          changes: transaction.changes,
          selection: transaction.selection,
          scrollIntoView: true,
          userEvent: transaction.annotation(Transaction.userEvent),
          annotations: isolateHistory.of("full"),
        })
      )
    if (!text.startsWith("\ufeff") && !text.includes("\r\n"))
      return command({ state, dispatch: isolatedDispatch })

    const bom = text.startsWith("\ufeff") ? "\ufeff" : ""
    const endings: string[] = []
    const lines = Array.from({ length: state.doc.lines }, (_, index) => {
      let line = state.doc.line(index + 1).text
      if (index < state.doc.lines - 1) {
        const crlf = line.endsWith("\r")
        endings.push(crlf ? "\r\n" : "\n")
        if (crlf) line = line.slice(0, -1)
      }
      return index === 0 && bom ? line.slice(1) : line
    })
    const logical = EditorState.create({
      doc: lines.join("\n"),
      extensions: [
        EditorState.allowMultipleSelections.of(true),
        EditorState.lineSeparator.of("\n"),
      ],
    })
    const logicalPosition = (position: number) => {
      const line = state.doc.lineAt(position)
      const column = Math.max(
        0,
        position - line.from - (line.number === 1 ? bom.length : 0)
      )
      const target = logical.doc.line(line.number)
      return target.from + Math.min(column, target.length)
    }
    const selected = logical.update({
      selection: EditorSelection.create(
        state.selection.ranges.map((range) =>
          EditorSelection.range(
            logicalPosition(range.anchor),
            logicalPosition(range.head)
          )
        ),
        state.selection.mainIndex
      ),
    }).state
    let result: Transaction | undefined
    if (
      !command({
        state: selected,
        dispatch: (transaction) => {
          result = transaction
        },
      }) ||
      !result
    )
      return false
    const updated: Transaction = result
    const copying = action.startsWith("duplicate")
    const mappedEndings = new Map<number, string>()
    if (copying) {
      endings.forEach((ending, index) =>
        mappedEndings.set(
          updated.changes.mapPos(selected.doc.line(index + 1).to, 1),
          ending
        )
      )
      updated.changes.iterChanges((from, _to, fromB, _toB, insert) => {
        const sourceRow = selected.doc.lineAt(from).number
        const count = insert.lines - 1
        const fallback =
          endings[Math.min(sourceRow - 1, endings.length - 1)] ?? "\n"
        for (let number = 1; number <= count; number++) {
          const sourceIndex =
            action === "duplicateDown"
              ? sourceRow + number - 2
              : number === 1
                ? sourceRow - 1
                : sourceRow - count + number - 2
          mappedEndings.set(
            fromB + insert.line(number).to,
            endings[sourceIndex] ?? fallback
          )
        }
      })
    }
    const inverse = updated.changes.invertedDesc
    const starts: number[] = []
    let output = bom
    for (let number = 1; number <= updated.state.doc.lines; number++) {
      const line = updated.state.doc.line(number)
      starts.push(output.length)
      output += line.text
      if (number < updated.state.doc.lines) {
        // Moves retain the existing separators at each row. Copies retain both
        // the old separators and those inside the duplicated block.
        const originalRow = selected.doc.lineAt(inverse.mapPos(line.to)).number
        output += copying
          ? (mappedEndings.get(line.to) ??
            endings[Math.min(originalRow - 1, endings.length - 1)] ??
            "\n")
          : endings[number - 1]
      }
    }
    const rawPosition = (position: number) => {
      const line = updated.state.doc.lineAt(position)
      return starts[line.number - 1] + position - line.from
    }
    // Store only the changed span in history, even for a large imported file.
    let from = 0
    while (
      from < text.length &&
      from < output.length &&
      text.charCodeAt(from) === output.charCodeAt(from)
    )
      from++
    let to = text.length,
      endOfInsert = output.length
    while (
      to > from &&
      endOfInsert > from &&
      text.charCodeAt(to - 1) === output.charCodeAt(endOfInsert - 1)
    ) {
      to--
      endOfInsert--
    }
    dispatch(
      state.update({
        changes: { from, to, insert: output.slice(from, endOfInsert) },
        selection: EditorSelection.create(
          updated.state.selection.ranges.map((range) =>
            EditorSelection.range(
              rawPosition(range.anchor),
              rawPosition(range.head)
            )
          ),
          updated.state.selection.mainIndex
        ),
        scrollIntoView: true,
        userEvent: copying ? "input.copyline" : "move.line",
        annotations: isolateHistory.of("full"),
      })
    )
    return true
  }
}
