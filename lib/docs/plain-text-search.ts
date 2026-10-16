import type { EditorState } from "@codemirror/state"
import type { SearchQuery } from "@codemirror/search"

// Bound live counting for documents with very many matches. Navigation and
// Replace All still use the complete document through CodeMirror's commands.
export const searchCountLimit = 10_000

export function countSearchMatches(state: EditorState, query: SearchQuery) {
  if (!query.valid) return { count: 0, capped: false }
  const cursor = query.getCursor(state)
  let count = 0
  while (!cursor.next().done) {
    if (count === searchCountLimit) return { count, capped: true }
    count++
  }
  return { count, capped: false }
}
