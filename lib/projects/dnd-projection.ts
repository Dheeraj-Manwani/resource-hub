/** Pure helpers for the sidebar's indentation-based drag-and-drop reorder,
 * following the standard flattened-tree projection approach: depth is
 * derived from horizontal drag offset, clamped between the previous item's
 * depth + 1 and the next item's depth. */

export type ProjectionItem = { id: string; parentId: string | null; depth: number }

export function arrayMoveItems<T>(array: T[], from: number, to: number): T[] {
  const copy = array.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(to < 0 ? copy.length + to : to, 0, moved!)
  return copy
}

export type Projection = { depth: number; parentId: string | null }

export function getProjection(
  items: ProjectionItem[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
  indentWidth: number
): Projection | null {
  const activeIndex = items.findIndex((i) => i.id === activeId)
  const overIndex = items.findIndex((i) => i.id === overId)
  if (activeIndex === -1 || overIndex === -1) return null

  const activeItem = items[activeIndex]!
  const newItems = arrayMoveItems(items, activeIndex, overIndex)
  const previousItem = newItems[overIndex - 1]
  const nextItem = newItems[overIndex + 1]
  const dragDepth = Math.round(dragOffsetX / indentWidth)
  const projectedDepth = activeItem.depth + dragDepth
  const maxDepth = previousItem ? previousItem.depth + 1 : 0
  const minDepth = nextItem ? nextItem.depth : 0

  let depth = projectedDepth
  if (depth > maxDepth) depth = maxDepth
  if (depth < minDepth) depth = minDepth

  function parentIdAt(targetDepth: number): string | null {
    if (targetDepth === 0 || !previousItem) return null
    if (targetDepth === previousItem.depth) return previousItem.parentId
    if (targetDepth > previousItem.depth) return previousItem.id
    const ancestor = newItems
      .slice(0, overIndex)
      .reverse()
      .find((item) => item.depth === targetDepth)
    return ancestor?.parentId ?? null
  }

  return { depth, parentId: parentIdAt(depth) }
}

/** The nearest siblings (at the resolved parent) around the drop position,
 * used to anchor the new fractional sort key. */
export function findSiblingAnchors(
  items: ProjectionItem[],
  activeId: string,
  overId: string,
  parentId: string | null
): { beforeId?: string; afterId?: string } {
  const activeIndex = items.findIndex((i) => i.id === activeId)
  const overIndex = items.findIndex((i) => i.id === overId)
  if (activeIndex === -1 || overIndex === -1) return {}
  const newItems = arrayMoveItems(items, activeIndex, overIndex)
  const draggedIndex = newItems.findIndex((i) => i.id === activeId)

  let afterId: string | undefined
  for (let i = draggedIndex - 1; i >= 0; i--) {
    if (newItems[i]!.id !== activeId && newItems[i]!.parentId === parentId) {
      afterId = newItems[i]!.id
      break
    }
  }
  let beforeId: string | undefined
  for (let i = draggedIndex + 1; i < newItems.length; i++) {
    if (newItems[i]!.id !== activeId && newItems[i]!.parentId === parentId) {
      beforeId = newItems[i]!.id
      break
    }
  }
  return { beforeId, afterId }
}
