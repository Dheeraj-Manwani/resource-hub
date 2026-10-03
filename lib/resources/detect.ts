import type { ResourceMetadata, ResourceType } from "./types"

export type DetectedUrl = {
  type: ResourceType
  /** Canonical URL used for opening/embedding. */
  url: string
  /** Stable form used for duplicate detection. */
  urlNormalized: string
  /** Platform identifiers known from the URL alone. */
  metadata: ResourceMetadata
}

export type ParsedInput =
  | { kind: "urls"; items: DetectedUrl[]; titleHint?: string }
  | { kind: "note"; text: string }
  | { kind: "empty" }

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "igsh",
  "ref_src",
  "ref_url",
  "_ga",
  "yclid",
  "si",
])

const GITHUB_RESERVED = new Set([
  "about",
  "apps",
  "collections",
  "customer-stories",
  "enterprise",
  "explore",
  "features",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "issues",
  "search",
  "settings",
  "signup",
  "sponsors",
  "topics",
  "trending",
])

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi
const BARE_DOMAIN_RE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i

/** Parses a string into a URL, accepting bare domains like `github.com/x`. */
export function parseUrl(input: string): URL | null {
  const raw = input.trim()
  if (!raw || /\s/.test(raw)) return null
  let candidate = raw
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    if (!BARE_DOMAIN_RE.test(candidate)) return null
    candidate = `https://${candidate}`
  }
  try {
    const url = new URL(candidate)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".")) return null
    return url
  } catch {
    return null
  }
}

function bareHost(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/^(www\.|m\.|mobile\.)/, "")
    .replace(/\.$/, "")
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean)
}

/** Parses YouTube `t`/`start` values like `90`, `90s`, `1m30s`, `1h2m3s`. */
export function parseYoutubeTime(value: string | null): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value)) return Number(value)
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!match || !match[0]) return undefined
  const [, h, m, s] = match
  const total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
  return total > 0 ? total : undefined
}

/**
 * Generic normalization: lowercase host, drop `www.`, tracking params, hash
 * and trailing slash; sort the remaining query params.
 */
export function normalizeGenericUrl(url: URL): string {
  const host = bareHost(url)
  const params = [...url.searchParams.entries()]
    .filter(
      ([key]) =>
        !key.toLowerCase().startsWith("utm_") &&
        !TRACKING_PARAMS.has(key.toLowerCase())
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const path = url.pathname.replace(/\/+$/, "")
  const port = url.port ? `:${url.port}` : ""
  const query = params.length
    ? `?${params
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")}`
    : ""
  return `${url.protocol}//${host}${port}${path}${query}`.replace(
    /^http:/,
    "https:"
  )
}

function cleanUrl(url: URL): string {
  const copy = new URL(url.toString())
  for (const key of [...copy.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      TRACKING_PARAMS.has(key.toLowerCase())
    ) {
      copy.searchParams.delete(key)
    }
  }
  return copy.toString()
}

function detectYoutube(url: URL, host: string): DetectedUrl | null {
  let videoId: string | undefined
  let isShort = false
  const segments = pathSegments(url)
  if (host === "youtu.be") {
    videoId = segments[0]
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (segments[0] === "watch")
      videoId = url.searchParams.get("v") ?? undefined
    else if (["shorts", "embed", "live", "v"].includes(segments[0] ?? "")) {
      videoId = segments[1]
      isShort = segments[0] === "shorts"
    }
  } else {
    return null
  }
  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) return null
  const start = parseYoutubeTime(
    url.searchParams.get("t") ?? url.searchParams.get("start")
  )
  const canonical = isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}${start ? `&t=${start}s` : ""}`
  return {
    type: "youtube",
    url: canonical,
    urlNormalized: `https://youtube.com/watch?v=${videoId}`,
    metadata: {
      siteName: "YouTube",
      youtube: {
        videoId,
        ...(start ? { start } : {}),
        ...(isShort ? { isShort } : {}),
      },
      image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    },
  }
}

function detectInstagram(url: URL, host: string): DetectedUrl | null {
  if (host !== "instagram.com" && host !== "instagr.am") return null
  const segments = pathSegments(url)
  // `/p/CODE`, `/reel/CODE`, `/reels/CODE`, `/tv/CODE`, or `/<user>/p/CODE`.
  const idx = segments.findIndex((s) =>
    ["p", "reel", "reels", "tv"].includes(s)
  )
  if (idx === -1 || idx > 1) return null
  const shortcode = segments[idx + 1]
  if (!shortcode || !/^[\w-]+$/.test(shortcode)) return null
  const rawKind = segments[idx]
  const kind = rawKind === "reels" ? "reel" : (rawKind as "p" | "reel" | "tv")
  return {
    type: "instagram",
    url: `https://www.instagram.com/${kind}/${shortcode}/`,
    urlNormalized: `https://instagram.com/p/${shortcode}`,
    metadata: { siteName: "Instagram", instagram: { shortcode, kind } },
  }
}

function detectX(url: URL, host: string): DetectedUrl | null {
  if (host !== "x.com" && host !== "twitter.com") return null
  const segments = pathSegments(url)
  const idx = segments.indexOf("status")
  if (idx !== 1) return null
  const handle = segments[0]
  const statusId = segments[2]
  if (!handle || !statusId || !/^\d+$/.test(statusId)) return null
  const isGeneric = handle === "i" || handle === "i/web"
  return {
    type: "x",
    url: `https://x.com/${handle}/status/${statusId}`,
    urlNormalized: `https://x.com/i/status/${statusId}`,
    metadata: {
      siteName: "X",
      x: { statusId, ...(isGeneric ? {} : { handle }) },
      ...(isGeneric ? {} : { author: `@${handle}` }),
    },
  }
}

function detectGithub(url: URL, host: string): DetectedUrl | null {
  const segments = pathSegments(url)
  if (host === "gist.github.com") {
    const gistId = segments.length >= 2 ? segments[1] : segments[0]
    if (!gistId || !/^[0-9a-f]{5,}$/i.test(gistId)) return null
    const owner = segments.length >= 2 ? segments[0]! : ""
    return {
      type: "github",
      url: `https://gist.github.com/${owner ? `${owner}/` : ""}${gistId}`,
      urlNormalized: `https://gist.github.com/${gistId.toLowerCase()}`,
      metadata: {
        siteName: "GitHub",
        github: { kind: "gist", owner, gistId },
      },
    }
  }
  if (host !== "github.com") return null
  const [owner, repo, section, num] = segments
  if (!owner || !repo || GITHUB_RESERVED.has(owner.toLowerCase())) return null
  const cleanRepo = repo.replace(/\.git$/, "")
  const base = `https://github.com/${owner}/${cleanRepo}`
  const normBase = base.toLowerCase()
  if (
    (section === "issues" || section === "pull") &&
    num &&
    /^\d+$/.test(num)
  ) {
    const kind = section === "issues" ? "issue" : "pull"
    return {
      type: "github",
      url: `${base}/${section}/${num}`,
      urlNormalized: `${normBase}/${section}/${num}`,
      metadata: {
        siteName: "GitHub",
        github: { kind, owner, repo: cleanRepo, number: Number(num) },
      },
    }
  }
  if (segments.length === 2) {
    return {
      type: "github",
      url: base,
      urlNormalized: normBase,
      metadata: {
        siteName: "GitHub",
        github: { kind: "repo", owner, repo: cleanRepo },
      },
    }
  }
  // Deeper paths (files, releases, ...) stay GitHub-typed but keep their path.
  return {
    type: "github",
    url: cleanUrl(url),
    urlNormalized: normalizeGenericUrl(url),
    metadata: {
      siteName: "GitHub",
      github: { kind: "repo", owner, repo: cleanRepo },
    },
  }
}

function detectPinterest(url: URL, host: string): DetectedUrl | null {
  if (host === "pin.it") {
    return {
      type: "pinterest",
      url: cleanUrl(url),
      urlNormalized: normalizeGenericUrl(url),
      metadata: { siteName: "Pinterest", pinterest: {} },
    }
  }
  // pinterest.com, pinterest.co.uk, in.pinterest.com, ...
  if (!/(^|\.)pinterest\.[a-z.]+$/.test(host)) return null
  const segments = pathSegments(url)
  if (segments[0] !== "pin" || !segments[1]) return null
  const pinId = segments[1].match(/(\d+)$/)?.[1] ?? segments[1]
  return {
    type: "pinterest",
    url: `https://www.pinterest.com/pin/${pinId}/`,
    urlNormalized: `https://pinterest.com/pin/${pinId}`,
    metadata: { siteName: "Pinterest", pinterest: { pinId } },
  }
}

/** URL → resource type, canonical URL, normalized URL and known ids. */
export function detectUrl(input: string | URL): DetectedUrl | null {
  const url = typeof input === "string" ? parseUrl(input) : input
  if (!url) return null
  const host = bareHost(url)
  return (
    detectYoutube(url, host) ??
    detectInstagram(url, host) ??
    detectX(url, host) ??
    detectGithub(url, host) ??
    detectPinterest(url, host) ?? {
      type: "link",
      url: cleanUrl(url),
      urlNormalized: normalizeGenericUrl(url),
      metadata: { siteName: host },
    }
  )
}

/** Normalized form of any URL (for duplicate checks). */
export function normalizeUrl(input: string): string | null {
  return detectUrl(input)?.urlNormalized ?? null
}

/**
 * Interprets the "smart box": one URL, many URLs (one per line), a URL
 * surrounded by a short share text, or free text (a note).
 */
export function parseInput(raw: string): ParsedInput {
  const text = raw.replace(/\r\n/g, "\n").trim()
  if (!text) return { kind: "empty" }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const lineUrls = lines.map((l) => detectUrl(l))
  if (lineUrls.every((d): d is DetectedUrl => d !== null)) {
    return { kind: "urls", items: dedupe(lineUrls) }
  }

  const found = [...text.matchAll(URL_RE)].map((m) =>
    m[0].replace(/[),.;:!?\]]+$/, "")
  )
  if (found.length === 1) {
    const rest = text.replace(found[0]!, "").replace(/\s+/g, " ").trim()
    const detected = detectUrl(found[0]!)
    if (detected && rest.length <= 200) {
      return {
        kind: "urls",
        items: [detected],
        titleHint: rest.replace(/[\s\-–—:|]+$/, "") || undefined,
      }
    }
  }
  return { kind: "note", text }
}

function dedupe(items: DetectedUrl[]): DetectedUrl[] {
  const seen = new Set<string>()
  return items.filter((i) => {
    if (seen.has(i.urlNormalized)) return false
    seen.add(i.urlNormalized)
    return true
  })
}

export function typeFromMime(mime: string): "image" | "file" {
  return mime.startsWith("image/") ? "image" : "file"
}
