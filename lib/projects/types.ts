/** Flat row as returned by the tree endpoint; counts are direct (not rolled up). */
export type ProjectDto = {
  id: string
  parentId: string | null
  name: string
  description: string | null
  icon: string | null
  color: string | null
  sortKey: string
  archivedAt: string | null
  directCount: number
  createdAt: string
  updatedAt: string
}

export type ProjectTreeNode = ProjectDto & {
  depth: number
  /** Direct count plus every descendant's, computed client-side. */
  totalCount: number
  children: ProjectTreeNode[]
}

/** 10 dark-friendly hues a project can be tagged with. */
export const PROJECT_COLORS = [
  "#FF6A00",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#A855F7",
  "#6366F1",
  "#0EA5E9",
  "#14B8A6",
  "#84CC16",
  "#78716C",
] as const

export type ProjectColor = (typeof PROJECT_COLORS)[number]
