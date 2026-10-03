import { describe, expect, it } from "vitest"

import {
  detectUrl,
  normalizeUrl,
  parseInput,
  parseUrl,
  parseYoutubeTime,
  typeFromMime,
} from "@/lib/resources/detect"

describe("parseUrl", () => {
  it("accepts http(s) URLs and bare domains", () => {
    expect(parseUrl("https://example.com/a")?.href).toBe(
      "https://example.com/a"
    )
    expect(parseUrl("github.com/vercel/next.js")?.href).toBe(
      "https://github.com/vercel/next.js"
    )
  })
  it("rejects non-URLs and other schemes", () => {
    expect(parseUrl("hello world")).toBeNull()
    expect(parseUrl("javascript:alert(1)")).toBeNull()
    expect(parseUrl("ftp://example.com/file")).toBeNull()
    expect(parseUrl("localhost")).toBeNull()
  })
})

describe("normalizeUrl", () => {
  it("lowercases host, strips www, tracking params, hash and trailing slash", () => {
    expect(
      normalizeUrl(
        "https://WWW.Example.com/Path/?utm_source=x&b=2&a=1&fbclid=y#frag"
      )
    ).toBe("https://example.com/Path?a=1&b=2")
  })
  it("treats http and https as the same resource", () => {
    expect(normalizeUrl("http://example.com/")).toBe(
      normalizeUrl("https://example.com")
    )
  })
  it("canonicalizes YouTube variants to one form", () => {
    const expected = "https://youtube.com/watch?v=dQw4w9WgXcQ"
    expect(normalizeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe(expected)
    expect(normalizeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42")).toBe(
      expected
    )
    expect(normalizeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      expected
    )
    expect(normalizeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      expected
    )
  })
  it("treats x.com and twitter.com as equivalent", () => {
    expect(normalizeUrl("https://twitter.com/jack/status/20?s=20")).toBe(
      normalizeUrl("https://x.com/jack/status/20")
    )
  })
  it("treats Instagram reel/reels/p as the same post", () => {
    expect(normalizeUrl("https://www.instagram.com/reels/Cabc123/")).toBe(
      "https://instagram.com/p/Cabc123"
    )
    expect(normalizeUrl("https://instagram.com/reel/Cabc123/?igsh=xyz")).toBe(
      "https://instagram.com/p/Cabc123"
    )
  })
})

describe("detectUrl", () => {
  it("detects YouTube watch, shorts, youtu.be and start time", () => {
    const watch = detectUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"
    )!
    expect(watch.type).toBe("youtube")
    expect(watch.metadata.youtube).toEqual({
      videoId: "dQw4w9WgXcQ",
      start: 90,
    })
    expect(watch.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s")

    const short = detectUrl("https://youtube.com/shorts/dQw4w9WgXcQ")!
    expect(short.metadata.youtube?.isShort).toBe(true)
    expect(short.url).toBe("https://www.youtube.com/shorts/dQw4w9WgXcQ")

    expect(
      detectUrl("https://youtu.be/dQw4w9WgXcQ?t=15")!.metadata.youtube?.start
    ).toBe(15)
  })

  it("detects Instagram posts, reels and tv", () => {
    for (const [url, kind] of [
      ["https://www.instagram.com/p/Cabc123/", "p"],
      ["https://www.instagram.com/reel/Cabc123/", "reel"],
      ["https://www.instagram.com/reels/Cabc123/", "reel"],
      ["https://www.instagram.com/tv/Cabc123/", "tv"],
      ["https://www.instagram.com/someone/p/Cabc123/", "p"],
    ] as const) {
      const d = detectUrl(url)!
      expect(d.type).toBe("instagram")
      expect(d.metadata.instagram).toEqual({ shortcode: "Cabc123", kind })
    }
    expect(detectUrl("https://www.instagram.com/someone/")!.type).toBe("link")
  })

  it("detects X statuses", () => {
    const d = detectUrl("https://twitter.com/jack/status/20")!
    expect(d.type).toBe("x")
    expect(d.url).toBe("https://x.com/jack/status/20")
    expect(d.metadata.x).toEqual({ statusId: "20", handle: "jack" })
    expect(detectUrl("https://x.com/jack")!.type).toBe("link")
  })

  it("detects GitHub repos, issues, PRs and gists", () => {
    expect(
      detectUrl("https://github.com/vercel/next.js")!.metadata.github
    ).toEqual({
      kind: "repo",
      owner: "vercel",
      repo: "next.js",
    })
    expect(
      detectUrl("https://github.com/vercel/next.js/issues/123")!.metadata.github
    ).toMatchObject({
      kind: "issue",
      number: 123,
    })
    expect(
      detectUrl("https://github.com/vercel/next.js/pull/456")!.metadata.github
    ).toMatchObject({
      kind: "pull",
      number: 456,
    })
    const gist = detectUrl(
      "https://gist.github.com/octocat/aa5a315d61ae9438b18d"
    )!
    expect(gist.metadata.github).toMatchObject({
      kind: "gist",
      gistId: "aa5a315d61ae9438b18d",
      owner: "octocat",
    })
    expect(detectUrl("https://github.com/settings/profile")!.type).toBe("link")
    expect(normalizeUrl("https://github.com/Vercel/Next.js")).toBe(
      "https://github.com/vercel/next.js"
    )
  })

  it("detects Pinterest pins and pin.it short links", () => {
    const pin = detectUrl("https://in.pinterest.com/pin/123456789/")!
    expect(pin.type).toBe("pinterest")
    expect(pin.metadata.pinterest?.pinId).toBe("123456789")
    expect(pin.urlNormalized).toBe("https://pinterest.com/pin/123456789")
    expect(detectUrl("https://pin.it/abc123")!.type).toBe("pinterest")
  })

  it("falls back to a generic link", () => {
    const d = detectUrl("https://example.com/article?utm_medium=email")!
    expect(d.type).toBe("link")
    expect(d.url).toBe("https://example.com/article")
  })
})

describe("parseInput", () => {
  it("returns many URLs, one per line, deduplicated", () => {
    const parsed = parseInput("https://a.com\n\nhttps://b.com\nhttps://a.com/")
    expect(parsed.kind).toBe("urls")
    if (parsed.kind === "urls")
      expect(parsed.items.map((i) => i.urlNormalized)).toEqual([
        "https://a.com",
        "https://b.com",
      ])
  })
  it("extracts a URL from short share text and keeps the text as a title hint", () => {
    const parsed = parseInput("Great talk on CSS https://youtu.be/dQw4w9WgXcQ")
    expect(parsed).toMatchObject({
      kind: "urls",
      titleHint: "Great talk on CSS",
    })
  })
  it("treats text without a URL as a note", () => {
    expect(parseInput("remember to buy milk")).toEqual({
      kind: "note",
      text: "remember to buy milk",
    })
  })
  it("treats empty input as empty", () => {
    expect(parseInput("   \n ")).toEqual({ kind: "empty" })
  })
})

describe("helpers", () => {
  it("parses YouTube times", () => {
    expect(parseYoutubeTime("90")).toBe(90)
    expect(parseYoutubeTime("1h2m3s")).toBe(3723)
    expect(parseYoutubeTime("nope")).toBeUndefined()
    expect(parseYoutubeTime(null)).toBeUndefined()
  })
  it("maps MIME types to resource types", () => {
    expect(typeFromMime("image/png")).toBe("image")
    expect(typeFromMime("application/pdf")).toBe("file")
  })
})
