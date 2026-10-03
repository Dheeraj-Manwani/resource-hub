import "server-only"

import {
  fetchGeneric,
  fetchGithub,
  fetchInstagram,
  fetchX,
  fetchYoutube,
} from "./platforms"
import { MetadataError, type FetchInput, type FetchOutput } from "./types"

export { MetadataError } from "./types"
export { fetchGithubReadme } from "./platforms"

/** Fetches a fresh metadata snapshot using the best source per platform. */
export async function fetchMetadata(input: FetchInput): Promise<FetchOutput> {
  switch (input.type) {
    case "youtube":
      return fetchYoutube(input)
    case "instagram":
      return fetchInstagram(input)
    case "x":
      return fetchX(input)
    case "github":
      return fetchGithub(input)
    case "pinterest":
    case "link":
      return fetchGeneric(input)
    default:
      throw new MetadataError(`No metadata fetcher for ${input.type}`, false)
  }
}
