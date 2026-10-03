import { generateKeyBetween } from "fractional-indexing"

/** Sort key to append after the current last sibling (`null` when there are none yet). */
export function nextSortKey(lastKey: string | null): string {
  return generateKeyBetween(lastKey, null)
}

/** Sort key placing an item between two neighbors; either may be absent at an edge. */
export function sortKeyBetween(
  before: string | null,
  after: string | null
): string {
  return generateKeyBetween(before, after)
}
