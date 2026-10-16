import {
  EditorSelection,
  countColumn,
  type EditorState,
} from "@codemirror/state"
import { z } from "zod"

export const plainTextPreferencesSchema = z.object({
  wrap: z.boolean(),
  whitespace: z.boolean(),
  indent: z.enum(["tabs", "spaces"]),
  tabSize: z.union([z.literal(2), z.literal(4), z.literal(8)]),
})
export type PlainTextPreferences = z.infer<typeof plainTextPreferencesSchema>
export const defaultPlainTextPreferences: PlainTextPreferences = {
  wrap: false,
  whitespace: false,
  indent: "tabs",
  tabSize: 4,
}
export const plainTextPreferencesKey = "resource-hub:plain-text-preferences:v1"

export function plainTextTab(
  state: EditorState,
  preferences: PlainTextPreferences
) {
  return state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from)
    const column = countColumn(
      state.sliceDoc(line.from, range.from),
      preferences.tabSize
    )
    const insert =
      preferences.indent === "tabs"
        ? "\t"
        : " ".repeat(preferences.tabSize - (column % preferences.tabSize))
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    }
  })
}
