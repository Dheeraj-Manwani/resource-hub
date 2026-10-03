import "server-only"

import { parse } from "node-html-parser"

import { detectUrl } from "@/lib/resources/detect"
import type { GithubLabel, ResourceMetadata } from "@/lib/resources/types"
import { serverEnv } from "@/lib/env"
import { safeFetch, SsrfError } from "@/lib/server/ssrf"
import { safeHttpUrl, sanitizeRichHtml, stripText } from "@/lib/server/sanitize"

import { compact, fetchHtmlMetadata } from "./html"
import {
  errorForStatus,
  MetadataError,
  type FetchInput,
  type FetchOutput,
} from "./types"

async function fetchJson<T>(
  url: string,
  what: string,
  headers?: Record<string, string>
): Promise<T> {
  let res
  try {
    res = await safeFetch(url, {
      accept: ["application/json", "text/javascript", "application/vnd.github"],
      headers,
    })
  } catch (error) {
    if (error instanceof SsrfError)
      throw new MetadataError(error.message, false)
    throw new MetadataError(
      `${what} request failed: ${(error as Error).message}`,
      true
    )
  }
  if (res.status !== 200) throw errorForStatus(res.status, what)
  try {
    return res.json<T>()
  } catch {
    throw new MetadataError(`${what} returned invalid JSON`, true)
  }
}

/** ISO 8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(
  value: string | undefined
): number | undefined {
  if (!value) return undefined
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value)
  if (!m) return undefined
  const [, d, h, min, s] = m
  return (
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Number(s ?? 0)
  )
}

// ---------------------------------------------------------------- YouTube

type YoutubeOembed = {
  title?: string
  author_name?: string
  author_url?: string
  thumbnail_url?: string
}
type YoutubeVideos = {
  items?: {
    snippet?: {
      title?: string
      description?: string
      publishedAt?: string
      channelTitle?: string
      thumbnails?: Record<
        string,
        { url: string; width: number; height: number }
      >
    }
    contentDetails?: { duration?: string }
  }[]
}

export async function fetchYoutube({
  metadata,
}: FetchInput): Promise<FetchOutput> {
  const videoId = metadata.youtube?.videoId
  if (!videoId) throw new MetadataError("Missing YouTube video id", false)
  let embedStatus: FetchOutput["embedStatus"] = "ok"
  let oembed: YoutubeOembed = {}
  try {
    oembed = await fetchJson<YoutubeOembed>(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
      "YouTube oEmbed"
    )
  } catch (error) {
    // 401/403 from oEmbed means embedding is disabled; 404 means gone.
    if (error instanceof MetadataError && !error.retryable) {
      embedStatus = "unavailable"
      if (!serverEnv().YOUTUBE_API_KEY) throw error
    } else {
      throw error
    }
  }

  const result: ResourceMetadata = {
    ...metadata,
    ...compact({
      title: stripText(oembed.title, 300),
      author: stripText(oembed.author_name, 120),
      authorUrl: safeHttpUrl(oembed.author_url),
      siteName: "YouTube",
    }),
    image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    youtube: {
      ...metadata.youtube,
      videoId,
      channel: stripText(oembed.author_name, 120),
    },
  }

  const apiKey = serverEnv().YOUTUBE_API_KEY
  if (apiKey) {
    const data = await fetchJson<YoutubeVideos>(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`,
      "YouTube Data API"
    ).catch(() => ({}) as YoutubeVideos)
    const item = data.items?.[0]
    if (item?.snippet) {
      const thumbs = item.snippet.thumbnails ?? {}
      const best = thumbs.maxres ?? thumbs.standard ?? thumbs.high
      Object.assign(
        result,
        compact({
          title: result.title ?? stripText(item.snippet.title, 300),
          description: stripText(item.snippet.description, 600),
          publishedAt: item.snippet.publishedAt,
          image: best?.url,
        })
      )
      result.youtube = {
        ...result.youtube!,
        channel:
          result.youtube?.channel ?? stripText(item.snippet.channelTitle, 120),
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
      }
    }
  }
  return { metadata: result, embedStatus }
}

// -------------------------------------------------------------- Instagram

type InstagramOembed = {
  author_name?: string
  title?: string
  thumbnail_url?: string
  thumbnail_width?: number
  thumbnail_height?: number
}

export async function fetchInstagram({
  url,
  metadata,
}: FetchInput): Promise<FetchOutput> {
  const token = serverEnv().META_OEMBED_TOKEN
  if (token) {
    const data = await fetchJson<InstagramOembed>(
      `https://graph.facebook.com/v22.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(token)}`,
      "Instagram oEmbed"
    )
    return {
      metadata: {
        ...metadata,
        ...compact({
          title: stripText(data.title, 300),
          description: stripText(data.title, 600),
          author: data.author_name
            ? `@${stripText(data.author_name, 60)}`
            : undefined,
          authorUrl: data.author_name
            ? `https://www.instagram.com/${encodeURIComponent(data.author_name)}/`
            : undefined,
          image: safeHttpUrl(data.thumbnail_url),
          imageWidth: data.thumbnail_width,
          imageHeight: data.thumbnail_height,
        }),
      },
      embedStatus: "ok",
    }
  }
  // Without a token, OG tags are best effort (often behind a login wall).
  try {
    const { metadata: og } = await fetchHtmlMetadata(url)
    const loginWall =
      !og.title || /^Instagram$|Login • Instagram/i.test(og.title)
    return {
      metadata: {
        ...metadata,
        ...(loginWall
          ? {}
          : compact({
              title: og.title,
              description: og.description,
              image: og.image,
            })),
        siteName: "Instagram",
      },
    }
  } catch (error) {
    if (error instanceof MetadataError && error.embedStatus === "unavailable")
      throw error
    // Minimal snapshot is expected for Instagram; don't fail the resource.
    return { metadata: { ...metadata, siteName: "Instagram" } }
  }
}

// ----------------------------------------------------------------------- X

type XOembed = { author_name?: string; author_url?: string; html?: string }

export async function fetchX({
  url,
  metadata,
}: FetchInput): Promise<FetchOutput> {
  const data = await fetchJson<XOembed>(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true&theme=dark`,
    "X oEmbed"
  )
  const html = data.html ?? ""
  const root = parse(html)
  const paragraph = root.querySelector("blockquote p")
  const links = root.querySelectorAll("blockquote > a")
  const dateText = links.at(-1)?.text
  const date = dateText ? new Date(dateText) : undefined
  const text = stripText(
    paragraph?.innerHTML.replace(/<br\s*\/?>/gi, "\n"),
    1_000
  )
  const handle = data.author_url?.split("/").filter(Boolean).at(-1)

  return {
    metadata: {
      ...metadata,
      ...compact({
        title: text
          ? text.length > 120
            ? `${text.slice(0, 119)}…`
            : text
          : undefined,
        description: text,
        author: stripText(data.author_name, 120),
        authorUrl: safeHttpUrl(data.author_url),
        publishedAt:
          date && !Number.isNaN(date.getTime())
            ? date.toISOString()
            : undefined,
      }),
      siteName: "X",
      x: {
        ...metadata.x!,
        ...compact({
          handle,
          text,
          html: html ? sanitizeRichHtml(html) : undefined,
        }),
      },
    },
    embedStatus: "ok",
  }
}

// ------------------------------------------------------------------ GitHub

function githubHeaders(accept = "application/vnd.github+json") {
  const token = serverEnv().GITHUB_TOKEN
  return {
    accept,
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

type GhRepo = {
  full_name: string
  description?: string | null
  stargazers_count?: number
  forks_count?: number
  open_issues_count?: number
  language?: string | null
  topics?: string[]
  pushed_at?: string
  owner?: { avatar_url?: string; login?: string }
}
type GhIssue = {
  title?: string
  body?: string | null
  state?: string
  state_reason?: string | null
  comments?: number
  created_at?: string
  labels?: ({ name?: string; color?: string } | string)[]
  user?: { login?: string; avatar_url?: string }
  pull_request?: { merged_at?: string | null }
}
type GhGist = {
  description?: string | null
  created_at?: string
  owner?: { login?: string; avatar_url?: string }
  files?: Record<
    string,
    { filename?: string; language?: string | null; size?: number }
  >
}

export async function fetchGithub({
  metadata,
}: FetchInput): Promise<FetchOutput> {
  const gh = metadata.github
  if (!gh) throw new MetadataError("Missing GitHub identifiers", false)
  const api = "https://api.github.com"

  if (gh.kind === "gist" && gh.gistId) {
    const gist = await fetchJson<GhGist>(
      `${api}/gists/${gh.gistId}`,
      "GitHub gist",
      githubHeaders()
    )
    const files = Object.values(gist.files ?? {}).map((f) => ({
      name: f.filename ?? "file",
      language: f.language ?? undefined,
      size: f.size,
    }))
    return {
      metadata: {
        ...metadata,
        ...compact({
          title: stripText(gist.description, 300) ?? files[0]?.name,
          description: stripText(gist.description, 600),
          author: gist.owner?.login,
          authorAvatar: safeHttpUrl(gist.owner?.avatar_url),
          publishedAt: gist.created_at,
        }),
        github: { ...gh, owner: gist.owner?.login ?? gh.owner, files },
      },
    }
  }

  if ((gh.kind === "issue" || gh.kind === "pull") && gh.repo && gh.number) {
    const issue = await fetchJson<GhIssue>(
      `${api}/repos/${gh.owner}/${gh.repo}/issues/${gh.number}`,
      "GitHub issue",
      githubHeaders()
    )
    const labels: GithubLabel[] = (issue.labels ?? []).map((l) =>
      typeof l === "string"
        ? { name: l }
        : { name: l.name ?? "", color: l.color }
    )
    const merged = gh.kind === "pull" && issue.pull_request?.merged_at
    return {
      metadata: {
        ...metadata,
        ...compact({
          title: stripText(issue.title, 300),
          description: stripText(issue.body, 600),
          author: issue.user?.login,
          authorAvatar: safeHttpUrl(issue.user?.avatar_url),
          publishedAt: issue.created_at,
        }),
        image: `https://opengraph.githubassets.com/1/${gh.owner}/${gh.repo}/${gh.kind === "pull" ? "pull" : "issues"}/${gh.number}`,
        github: {
          ...gh,
          state: merged ? "merged" : issue.state,
          labels,
          comments: issue.comments,
        },
      },
    }
  }

  if (!gh.repo) throw new MetadataError("Missing GitHub repo", false)
  const repo = await fetchJson<GhRepo>(
    `${api}/repos/${gh.owner}/${gh.repo}`,
    "GitHub repo",
    githubHeaders()
  )
  return {
    metadata: {
      ...metadata,
      ...compact({
        title: repo.full_name,
        description: stripText(repo.description, 600),
        author: repo.owner?.login,
        authorAvatar: safeHttpUrl(repo.owner?.avatar_url),
      }),
      image: `https://opengraph.githubassets.com/1/${repo.full_name}`,
      github: {
        ...gh,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        language: repo.language ?? undefined,
        topics: repo.topics?.slice(0, 12),
        pushedAt: repo.pushed_at,
      },
    },
  }
}

/** README rendered by GitHub, sanitized, with relative links made absolute. */
export async function fetchGithubReadme(
  owner: string,
  repo: string
): Promise<string> {
  let res
  try {
    res = await safeFetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      {
        accept: ["text/html", "application/vnd.github"],
        headers: githubHeaders("application/vnd.github.html+json"),
        maxBytes: 1_500_000,
      }
    )
  } catch (error) {
    throw new MetadataError((error as Error).message, true)
  }
  if (res.status !== 200) throw errorForStatus(res.status, "README")
  const blobBase = `https://github.com/${owner}/${repo}/blob/HEAD/`
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/`
  const html = res
    .text()
    .replace(
      /(<img[^>]*\ssrc=")(?!https?:|data:)([^"]+)"/gi,
      (_m, pre: string, src: string) =>
        `${pre}${new URL(src.replace(/^\.?\//, ""), rawBase)}"`
    )
    .replace(
      /(<a[^>]*\shref=")(?!https?:|#|mailto:)([^"]+)"/gi,
      (_m, pre: string, href: string) =>
        `${pre}${new URL(href.replace(/^\.?\//, ""), blobBase)}"`
    )
  return sanitizeRichHtml(html)
}

// --------------------------------------------------------- Pinterest/link

export async function fetchGeneric({
  url,
  metadata,
  type,
}: FetchInput): Promise<FetchOutput> {
  const { metadata: og, finalUrl } = await fetchHtmlMetadata(url)
  const merged: ResourceMetadata = { ...metadata, ...compact(og) }
  let resolvedUrl: string | undefined
  if (type === "pinterest") {
    // pin.it short links resolve to the real pin URL.
    const detected = detectUrl(finalUrl)
    if (detected?.type === "pinterest" && detected.metadata.pinterest?.pinId) {
      merged.pinterest = detected.metadata.pinterest
      resolvedUrl = detected.url
    }
    merged.siteName = "Pinterest"
  }
  return { metadata: merged, url: resolvedUrl }
}
