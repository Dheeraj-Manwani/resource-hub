import type { ProjectDto, ProjectTreeNode } from "./types"

function sortBySortKey<T extends { sortKey: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
  )
}

/** Builds a sorted tree from a flat list. An orphaned `parentId` (e.g. a
 * soft-deleted parent) is treated as root rather than dropped. */
export function buildProjectTree(flat: ProjectDto[]): ProjectTreeNode[] {
  const byId = new Map(flat.map((p) => [p.id, p]))
  const childrenOf = new Map<string | null, ProjectDto[]>()
  for (const p of flat) {
    const parentKey = p.parentId && byId.has(p.parentId) ? p.parentId : null
    const list = childrenOf.get(parentKey) ?? []
    list.push(p)
    childrenOf.set(parentKey, list)
  }

  function build(parentId: string | null, depth: number): ProjectTreeNode[] {
    const kids = sortBySortKey(childrenOf.get(parentId) ?? [])
    return kids.map((p) => {
      const children = build(p.id, depth + 1)
      const totalCount =
        p.directCount + children.reduce((sum, c) => sum + c.totalCount, 0)
      return { ...p, depth, children, totalCount }
    })
  }

  return build(null, 0)
}

export function findNode(
  nodes: ProjectTreeNode[],
  id: string
): ProjectTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** Visible nodes in display order, skipping children of collapsed ids. */
export function flattenTree(
  nodes: ProjectTreeNode[],
  isCollapsed: (id: string) => boolean
): ProjectTreeNode[] {
  const out: ProjectTreeNode[] = []
  function walk(list: ProjectTreeNode[]) {
    for (const node of list) {
      out.push(node)
      if (!isCollapsed(node.id)) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/** `id` and every descendant id, for disabling invalid drop targets client-side. */
export function descendantIds(
  nodes: ProjectTreeNode[],
  id: string
): Set<string> {
  const node = findNode(nodes, id)
  const ids = new Set<string>()
  if (!node) return ids
  function collect(n: ProjectTreeNode) {
    ids.add(n.id)
    n.children.forEach(collect)
  }
  collect(node)
  return ids
}

/** True if `candidateId` is `ancestorId` or a descendant of it. */
export function isSelfOrDescendant(
  flat: Pick<ProjectDto, "id" | "parentId">[],
  ancestorId: string,
  candidateId: string
): boolean {
  if (ancestorId === candidateId) return true
  const byId = new Map(flat.map((p) => [p.id, p]))
  let current = byId.get(candidateId)?.parentId ?? null
  const seen = new Set<string>()
  while (current) {
    if (current === ancestorId) return true
    if (seen.has(current)) return false // corrupt/cyclic data: stop rather than loop
    seen.add(current)
    current = byId.get(current)?.parentId ?? null
  }
  return false
}

/** Ancestors from root to (excluding) `id`, for breadcrumbs. */
export function ancestorChain(
  flat: ProjectDto[],
  id: string
): ProjectDto[] {
  const byId = new Map(flat.map((p) => [p.id, p]))
  const chain: ProjectDto[] = []
  let current = byId.get(id)?.parentId ?? null
  const seen = new Set<string>()
  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current)
    chain.unshift(byId.get(current)!)
    current = byId.get(current)!.parentId
  }
  return chain
}
