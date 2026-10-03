export const RESOURCE_TYPES = [
  "instagram",
  "youtube",
  "x",
  "github",
  "pinterest",
  "link",
  "image",
  "note",
  "file",
] as const

export type ResourceType = (typeof RESOURCE_TYPES)[number]

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  github: "GitHub",
  pinterest: "Pinterest",
  link: "Link",
  image: "Image",
  note: "Note",
  file: "File",
}

export type MetadataStatus = "pending" | "ok" | "failed"
export type EmbedStatus = "unknown" | "ok" | "unavailable"

export type GithubLabel = { name: string; color?: string }

/**
 * Snapshot of what we know about a resource. Stored as jsonb so cards keep
 * rendering even if the original disappears. All strings are plain text
 * (already stripped) except `x.html`, which is sanitized HTML.
 */
export type ResourceMetadata = {
  title?: string
  description?: string
  siteName?: string
  author?: string
  authorUrl?: string
  authorAvatar?: string
  publishedAt?: string
  /** Remote image URL from the snapshot (OG image, oEmbed thumbnail, ...). */
  image?: string
  imageWidth?: number
  imageHeight?: number
  favicon?: string
  youtube?: {
    videoId: string
    start?: number
    isShort?: boolean
    channel?: string
    durationSeconds?: number
  }
  instagram?: {
    shortcode: string
    kind: "p" | "reel" | "tv"
  }
  x?: {
    statusId: string
    handle?: string
    text?: string
    html?: string
  }
  github?: {
    kind: "repo" | "issue" | "pull" | "gist"
    owner: string
    repo?: string
    number?: number
    gistId?: string
    stars?: number
    forks?: number
    openIssues?: number
    language?: string
    topics?: string[]
    pushedAt?: string
    state?: string
    labels?: GithubLabel[]
    comments?: number
    files?: { name: string; language?: string; size?: number }[]
  }
  pinterest?: {
    pinId?: string
  }
  error?: string
  /** Remote image URL that the current R2 snapshot was copied from. */
  imageSnapshotOf?: string
  /** The user uploaded their own thumbnail; refreshes must keep it. */
  thumbnailIsCustom?: boolean
}
