"use client"

import { useQuery } from "@tanstack/react-query"

import { api, toQueryString } from "@/lib/api-client"
import type { SearchResults } from "@/lib/server/dal/search"
import type { SearchQuery } from "@/lib/validation/search"

export function useSearch(query: Partial<SearchQuery>) {
  const hasAnyFilter =
    !!query.q ||
    !!query.type ||
    !!query.resourceType ||
    !!query.tag ||
    !!query.project ||
    query.favorite !== undefined ||
    query.linked !== undefined ||
    !!query.from ||
    !!query.to

  return useQuery({
    queryKey: ["search", query],
    queryFn: ({ signal }) =>
      api<SearchResults>(`/api/v1/search${toQueryString(query as Record<string, string | number | boolean | undefined>)}`, {
        signal,
      }),
    enabled: hasAnyFilter,
    placeholderData: (prev) => prev,
  })
}
