import "server-only"

import { parse } from "node-html-parser"

import type { ResourceMetadata } from "@/lib/resources/types"
import { safeFetch, SsrfError } from "@/lib/server/ssrf"
import { safeHttpUrl, stripText } from "@/lib/server/sanitize"

import { errorForStatus, MetadataError } from "./types"

type JsonLd = Record<string, unknown>

function firstJsonLd(root: ReturnType<typeof parse>): JsonLd | undefined {
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]'
  )) {
    try {
      const data = JSON.parse(script.text) as unknown
      const items = Array.isArray(data)
        ? data
        : ((data as { "@graph"?: unknown[] })["@graph"] ?? [data])
      const match = (items as JsonLd[]).find(
        (i) =>
          i && typeof i === "object" && (i.headline || i.name || i.description)
      )
      if (match) return match
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return undefined
}

function ldString(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return ldString(value[0])
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    return ldString(obj.url ?? obj.name ?? obj["@id"])
  }
  return undefined
}

/** Extracts OG / Twitter card / <title> / favicon / JSON-LD fields. */
export function extractHtmlMetadata(
  html: string,
  pageUrl: string
): ResourceMetadata {
  const root = parse(html, {
    blockTextElements: {
      script: true,
      style: false,
      pre: false,
      noscript: false,
    },
  })
  const meta = (...keys: string[]) => {
    for (const key of keys) {
      const el =
        root.querySelector(`meta[property="${key}"]`) ??
        root.querySelector(`meta[name="${key}"]`)
      const content = el?.getAttribute("content")
      if (content?.trim()) return content
    }
    return undefined
  }
  const ld = firstJsonLd(root)

  const iconHref =
    root.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ??
    root.querySelector('link[rel="icon"]')?.getAttribute("href") ??
    root.querySelector('link[rel="shortcut icon"]')?.getAttribute("href") ??
    "/favicon.ico"

  const width = Number(meta("og:image:width"))
  const height = Number(meta("og:image:height"))

  return {
    title: stripText(
      meta("og:title", "twitter:title") ??
        ldString(ld?.headline ?? ld?.name) ??
        root.querySelector("title")?.text,
      300
    ),
    description: stripText(
      meta("og:description", "twitter:description", "description") ??
        ldString(ld?.description),
      600
    ),
    siteName: stripText(meta("og:site_name", "application-name"), 100),
    author: stripText(
      meta("author", "article:author", "twitter:creator") ??
        ldString(ld?.author),
      120
    ),
    publishedAt: (() => {
      const raw =
        meta("article:published_time", "og:published_time", "date") ??
        ldString(ld?.datePublished)
      const date = raw ? new Date(raw) : undefined
      return date && !Number.isNaN(date.getTime())
        ? date.toISOString()
        : undefined
    })(),
    image: safeHttpUrl(
      meta(
        "og:image:secure_url",
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src"
      ) ?? ldString(ld?.image),
      pageUrl
    ),
    imageWidth: Number.isFinite(width) && width > 0 ? width : undefined,
    imageHeight: Number.isFinite(height) && height > 0 ? height : undefined,
    favicon: safeHttpUrl(iconHref, pageUrl),
  }
}

/** Fetches a page through the SSRF guard and extracts its metadata. */
export async function fetchHtmlMetadata(url: string) {
  let res
  try {
    res = await safeFetch(url, {
      accept: ["text/html", "application/xhtml+xml"],
    })
  } catch (error) {
    if (error instanceof SsrfError)
      throw new MetadataError(error.message, false)
    throw new MetadataError(`Fetch failed: ${(error as Error).message}`, true)
  }
  if (res.status !== 200) throw errorForStatus(res.status, "Page")
  return {
    metadata: extractHtmlMetadata(res.text(), res.url),
    finalUrl: res.url,
  }
}

/** Removes undefined keys so spreading never erases known values. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== "")
  ) as Partial<T>
}
