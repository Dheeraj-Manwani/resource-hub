import { describe, expect, it } from "vitest"

import {
  findSiblingAnchors,
  getProjection,
  type ProjectionItem,
} from "@/lib/projects/dnd-projection"

// Flat, visible order:
// 0 work        (depth 0)
// 1 client-a    (depth 1, parent work)
// 2 client-b    (depth 1, parent work)
// 3 personal    (depth 0)
const ITEMS: ProjectionItem[] = [
  { id: "work", parentId: null, depth: 0 },
  { id: "client-a", parentId: "work", depth: 1 },
  { id: "client-b", parentId: "work", depth: 1 },
  { id: "personal", parentId: null, depth: 0 },
]

describe("getProjection", () => {
  it("keeps depth/parent unchanged for a pure vertical reorder", () => {
    // Drag client-b to just before client-a (no horizontal movement) — it
    // stays a sibling of client-a under work.
    const proj = getProjection(ITEMS, "client-b", "client-a", 0, 24)
    expect(proj).toEqual({ depth: 1, parentId: "work" })
  })

  it("becomes a sibling of the item above at one indent step", () => {
    // Drop "personal" just before "client-b", nudged right by one level: it
    // lands at the same depth as client-a/client-b, under work.
    const proj = getProjection(ITEMS, "personal", "client-b", 24, 24)
    expect(proj).toEqual({ depth: 1, parentId: "work" })
  })

  it("nests under the item immediately above at two indent steps", () => {
    // Same drop position, nudged right by two levels: it becomes a child of
    // client-a (the item that ends up directly above it).
    const proj = getProjection(ITEMS, "personal", "client-b", 48, 24)
    expect(proj).toEqual({ depth: 2, parentId: "client-a" })
  })

  it("clamps depth to at most previousItem.depth + 1", () => {
    // However far right, it can't nest deeper than one level past the item
    // directly above the drop position.
    const proj = getProjection(ITEMS, "personal", "client-b", 999, 24)
    expect(proj).toEqual({ depth: 2, parentId: "client-a" })
  })

  it("clamps depth to at least the next item's depth", () => {
    // Dragging left past root can't go shallower than the next item (root).
    const proj = getProjection(ITEMS, "client-a", "client-b", -999, 24)
    expect(proj).toEqual({ depth: 0, parentId: null })
  })

  it("promotes to root (no parent) at depth 0", () => {
    const proj = getProjection(ITEMS, "client-a", "work", -999, 24)
    expect(proj).toEqual({ depth: 0, parentId: null })
  })

  it("returns null for an unknown id", () => {
    expect(getProjection(ITEMS, "missing", "work", 0, 24)).toBeNull()
  })
})

describe("findSiblingAnchors", () => {
  it("finds the sibling immediately before and after the drop position", () => {
    // Dropping "personal" over "client-b" inserts it just before client-b —
    // i.e. right after client-a — as a work-sibling.
    const { beforeId, afterId } = findSiblingAnchors(
      ITEMS,
      "personal",
      "client-b",
      "work"
    )
    expect(afterId).toBe("client-a")
    expect(beforeId).toBe("client-b")
  })

  it("has no afterId when dropped at the very start of its new parent", () => {
    const { afterId } = findSiblingAnchors(ITEMS, "client-b", "client-a", "work")
    expect(afterId).toBeUndefined()
  })
})
