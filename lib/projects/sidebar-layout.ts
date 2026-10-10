import { buildProjectTree } from "./tree"
import type { ProjectDto, ProjectTreeNode } from "./types"

export type SidebarTreeRow =
  | { type: "project"; node: ProjectTreeNode }
  | {
      type: "more"
      parentId: string | null
      depth: number
      count: number
      expanded: boolean
    }

/** One tree preserves every real parent/depth and registers each project once.
 * More groups live at the level of the branches they conceal. */
export function sidebarLayout(
  flat: ProjectDto[],
  pinnedProjectIds: string[] | null,
  isCollapsed: (id: string) => boolean,
  expandedMore: ReadonlySet<string | null>
): SidebarTreeRow[] {
  const tree = buildProjectTree(flat)
  const direct = new Set(pinnedProjectIds ?? flat.map((project) => project.id))
  const byId = new Map(flat.map((project) => [project.id, project]))
  const visited = new Set<string>()
  for (const id of pinnedProjectIds ?? []) {
    let current: string | null = id
    while (current && byId.has(current) && !visited.has(current)) {
      visited.add(current)
      direct.add(current)
      current = byId.get(current)!.parentId
    }
  }
  function countBranch(node: ProjectTreeNode): number {
    return (
      1 + node.children.reduce((count, child) => count + countBranch(child), 0)
    )
  }
  const rows: SidebarTreeRow[] = []
  function walk(
    nodes: ProjectTreeNode[],
    parentId: string | null,
    depth: number,
    inMore = false
  ) {
    const shown = inMore ? nodes : nodes.filter((node) => direct.has(node.id))
    const hidden = inMore ? [] : nodes.filter((node) => !direct.has(node.id))
    function project(node: ProjectTreeNode, hiddenBranch: boolean) {
      rows.push({ type: "project", node })
      if (!isCollapsed(node.id))
        walk(node.children, node.id, depth + 1, hiddenBranch)
    }
    shown.forEach((node) => project(node, inMore))
    if (hidden.length) {
      const expanded = expandedMore.has(parentId)
      rows.push({
        type: "more",
        parentId,
        depth,
        count: hidden.reduce((count, node) => count + countBranch(node), 0),
        expanded,
      })
      if (expanded) hidden.forEach((node) => project(node, true))
    }
  }
  walk(tree, null, 0)
  return rows
}
