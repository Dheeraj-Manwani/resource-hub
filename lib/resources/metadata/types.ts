import type {
  EmbedStatus,
  ResourceMetadata,
  ResourceType,
} from "@/lib/resources/types"

export type FetchInput = {
  type: ResourceType
  url: string
  /** Snapshot so far (ids known from detection, previous fetch, ...). */
  metadata: ResourceMetadata
}

export type FetchOutput = {
  metadata: ResourceMetadata
  embedStatus?: EmbedStatus
  /** Resolved canonical URL (e.g. after following pin.it). */
  url?: string
}

/** A fetch failure; `retryable` errors go back to the jobs queue. */
export class MetadataError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public embedStatus?: EmbedStatus
  ) {
    super(message)
  }
}

export function errorForStatus(status: number, what: string): MetadataError {
  if (status === 404 || status === 410) {
    return new MetadataError(
      `${what} not found (${status})`,
      false,
      "unavailable"
    )
  }
  if (status === 401 || status === 403) {
    return new MetadataError(`${what} is private or blocked (${status})`, false)
  }
  return new MetadataError(
    `${what} failed (${status})`,
    status === 429 || status >= 500
  )
}
