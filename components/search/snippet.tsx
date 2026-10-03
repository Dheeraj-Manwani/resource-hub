import { parseSnippet } from "@/lib/search/snippet"

/** Renders a `ts_headline` result with matches wrapped in `<mark>`. The
 * string still goes through React's normal text escaping — only the
 * sentinel-delimited split is special, never raw HTML. */
export function Snippet({ text }: { text: string }) {
  return (
    <>
      {parseSnippet(text).map((part, i) =>
        part.highlighted ? (
          <mark key={i} className="rounded-sm bg-brand-soft text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}
