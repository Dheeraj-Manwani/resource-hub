import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query"

type Entity = { id: string }
type Page<T> = { items: T[]; nextCursor: string | null }
export type Positions = Map<string, { page: number; index: number }>

export function capturePositions<T extends Entity>(
  client: QueryClient,
  prefix: QueryKey,
  id: string
): Positions {
  const positions: Positions = new Map()
  for (const query of client.getQueryCache().findAll({ queryKey: prefix })) {
    const data = query.state.data as InfiniteData<Page<T>> | undefined
    data?.pages.forEach((page, pageIndex) => {
      const index = page.items.findIndex((item) => item.id === id)
      if (index >= 0) positions.set(query.queryHash, { page: pageIndex, index })
    })
  }
  return positions
}

/** Unknown membership or an incomplete cursor range must never invent a row. */
export function reconcileList<T extends Entity>(
  data: InfiniteData<Page<T>>,
  id: string,
  value: T | null,
  matches: (item: T) => boolean | undefined,
  compare: (a: T, b: T) => number,
  position?: { page: number; index: number }
): InfiniteData<Page<T>> {
  const present = data.pages.some((page) =>
    page.items.some((item) => item.id === id)
  )
  const membership = value ? matches(value) : false
  const complete =
    data.pages.length > 0 &&
    data.pages.at(-1)?.nextCursor === null &&
    (data.pageParams[0] === null || data.pageParams[0] === undefined)
  const insert =
    !!value &&
    membership !== false &&
    (present || !!position || (complete && membership === true))
  const lengths = data.pages.map(
    (page) => page.items.filter((item) => item.id !== id).length
  )
  const items = data.pages
    .flatMap((page) => page.items)
    .filter((item) => item.id !== id)
  if (insert && value) {
    items.push(value)
    const target = Math.min(
      position?.page ?? 0,
      Math.max(lengths.length - 1, 0)
    )
    lengths[target]++
  }
  items.sort(compare)
  let offset = 0
  return {
    ...data,
    pages: data.pages.map((page, index) => {
      const rows = items.slice(offset, offset + lengths[index])
      offset += lengths[index]
      return { ...page, items: rows }
    }),
  }
}

export function writeLists<T extends Entity, F>(
  client: QueryClient,
  prefix: QueryKey,
  id: string,
  value: T | null,
  matches: (value: T, filters: F) => boolean | undefined,
  comparator: (filters: F) => (a: T, b: T) => number,
  positions?: Positions
) {
  for (const query of client.getQueryCache().findAll({ queryKey: prefix })) {
    const filters = (query.queryKey[2] ?? {}) as F
    client.setQueryData<InfiniteData<Page<T>>>(query.queryKey, (data) =>
      data
        ? reconcileList(
            data,
            id,
            value,
            (item) => matches(item, filters),
            comparator(filters),
            positions?.get(query.queryHash)
          )
        : data
    )
  }
}

export function compareValues(
  a: string | number | null,
  b: string | number | null,
  order: "asc" | "desc" = "asc"
) {
  // PostgreSQL defaults to NULLS LAST for ASC and NULLS FIRST for DESC.
  const value = a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1
  return order === "desc" ? -value : value
}

export function inProject(
  client: QueryClient,
  id: string | null,
  target: string,
  descendants?: boolean
): boolean | undefined {
  if (id === target) return true
  if (!id || !descendants) return false
  const tree = client.getQueryData<{
    items: { id: string; parentId: string | null }[]
  }>(["projects", "tree"])
  if (!tree) return undefined
  const visited = new Set<string>()
  let current: string | null = id
  while (current && !visited.has(current)) {
    if (current === target) return true
    visited.add(current)
    const project = tree.items.find((item) => item.id === current)
    if (!project) return undefined
    current = project.parentId
  }
  return false
}
