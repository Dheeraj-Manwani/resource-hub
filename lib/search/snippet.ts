/** Sentinel control characters `ts_headline` wraps matches in. Shared
 * (not server-only) because the client splits on them to render `<mark>`
 * without ever touching `dangerouslySetInnerHTML` — the surrounding text
 * still goes through React's normal escaping. */
export const SNIPPET_START = "\u0001"
export const SNIPPET_END = "\u0002"

export type SnippetPart = { text: string; highlighted: boolean }

export function parseSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let rest = snippet
  while (rest.length) {
    const start = rest.indexOf(SNIPPET_START)
    if (start === -1) {
      parts.push({ text: rest, highlighted: false })
      break
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), highlighted: false })
    const end = rest.indexOf(SNIPPET_END, start + 1)
    if (end === -1) {
      parts.push({ text: rest.slice(start + 1), highlighted: false })
      break
    }
    parts.push({ text: rest.slice(start + 1, end), highlighted: true })
    rest = rest.slice(end + 1)
  }
  return parts
}
