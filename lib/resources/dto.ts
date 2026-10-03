import type {
  EmbedStatus,
  MetadataStatus,
  ResourceMetadata,
  ResourceType,
} from "./types"

export type TagDto = { id: string; name: string; color: string | null }

export type FileDto = {
  id: string
  name: string
  mime: string
  size: number
  width: number | null
  height: number | null
  url: string
}

/** Shape returned by /api/v1/resources. */
export type ResourceDto = {
  id: string
  type: ResourceType
  url: string | null
  title: string | null
  description: string | null
  notes: string | null
  bodyJson: Record<string, unknown> | null
  bodyText: string | null
  /** Snapshot with user overrides applied. */
  metadata: ResourceMetadata
  metadataOverride: Partial<ResourceMetadata> | null
  metadataStatus: MetadataStatus
  metadataFetchedAt: string | null
  embedStatus: EmbedStatus
  isFavorite: boolean
  isReviewed: boolean
  /** Our stored thumbnail (signed redirect) or the snapshot's remote image. */
  thumbnailUrl: string | null
  file: FileDto | null
  tags: TagDto[]
  createdAt: string
  updatedAt: string
}

export type ResourcePage = { items: ResourceDto[]; nextCursor: string | null }

export function displayTitle(
  r: Pick<
    ResourceDto,
    "title" | "metadata" | "url" | "type" | "bodyText" | "file"
  >
) {
  return (
    r.title ||
    r.metadata.title ||
    r.file?.name ||
    (r.type === "note" && r.bodyText
      ? r.bodyText.split("\n")[0]!.slice(0, 120)
      : null) ||
    (r.url ? prettyUrl(r.url) : "Untitled")
  )
}

export function prettyUrl(url: string) {
  try {
    const u = new URL(url)
    const path = u.pathname === "/" ? "" : u.pathname
    return `${u.hostname.replace(/^www\./, "")}${path}`.slice(0, 120)
  } catch {
    return url
  }
}

export function hostname(url: string | null) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}
