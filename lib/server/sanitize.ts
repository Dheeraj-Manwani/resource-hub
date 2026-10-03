import "server-only"

import sanitizeHtml from "sanitize-html"

/** Removes all markup and collapses whitespace; for fetched plain strings. */
export function stripText(
  value: unknown,
  maxLength = 2_000
): string | undefined {
  if (typeof value !== "string") return undefined
  const text = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return undefined
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

/** Only http(s) URLs survive; everything else becomes undefined. */
export function safeHttpUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  try {
    const url = new URL(value.trim(), base)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

/** HTML that is stored or rendered (oEmbed fallbacks, READMEs). */
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "h1",
      "h2",
      "details",
      "summary",
      "picture",
      "source",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "title", "width", "height"],
      source: ["srcset", "media", "type"],
      code: ["class"],
      th: ["align"],
      td: ["align"],
      "*": ["dir", "lang"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      }),
    },
  })
}
