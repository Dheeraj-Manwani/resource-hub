import type { QueryClient } from "@tanstack/react-query"
import type { ResourceDto } from "@/lib/resources/dto"

export function activePendingMetadata(client: QueryClient): string[] {
  const pending = new Set<string>()
  for (const query of client
    .getQueryCache()
    .findAll({ queryKey: ["resources"] })) {
    if (!query.isActive()) continue
    const data = query.state.data as
      | {
          pages?: { items: ResourceDto[] }[]
          metadataStatus?: string
          id?: string
        }
      | undefined
    if (query.queryKey[1] === "list")
      data?.pages?.forEach((page) =>
        page.items.forEach((row) => {
          if (row.metadataStatus === "pending") pending.add(row.id)
        })
      )
    else if (
      query.queryKey[1] === "detail" &&
      data?.metadataStatus === "pending" &&
      data.id
    )
      pending.add(data.id)
  }
  return [...pending].sort()
}
export function metadataPollInterval(elapsed: number) {
  return elapsed < 60_000 ? 3_000 : elapsed < 120_000 ? 15_000 : 60_000
}
