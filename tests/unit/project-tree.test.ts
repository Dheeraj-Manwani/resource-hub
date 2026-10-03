import { describe, expect, it } from "vitest"

import {
  ancestorChain,
  buildProjectTree,
  descendantIds,
  findNode,
  flattenTree,
  isSelfOrDescendant,
} from "@/lib/projects/tree"
import type { ProjectDto } from "@/lib/projects/types"

function project(p: Partial<ProjectDto> & { id: string }): ProjectDto {
  return {
    parentId: null,
    name: p.id,
    description: null,
    icon: null,
    color: null,
    sortKey: "a0",
    archivedAt: null,
    directCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  }
}

// root
//  ├─ work (3 direct)
//  │   └─ client-a (2 direct)
//  └─ personal (1 direct)
const FLAT: ProjectDto[] = [
  project({ id: "work", sortKey: "a0", directCount: 3 }),
  project({ id: "personal", sortKey: "a1", directCount: 1 }),
  project({
    id: "client-a",
    parentId: "work",
    sortKey: "a0",
    directCount: 2,
  }),
]

describe("buildProjectTree", () => {
  it("nests children under their parent, sorted by sortKey", () => {
    const tree = buildProjectTree(FLAT)
    expect(tree.map((n) => n.id)).toEqual(["work", "personal"])
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["client-a"])
    expect(tree[0]!.depth).toBe(0)
    expect(tree[0]!.children[0]!.depth).toBe(1)
  })

  it("rolls counts up through ancestors", () => {
    const tree = buildProjectTree(FLAT)
    const work = tree.find((n) => n.id === "work")!
    expect(work.children[0]!.totalCount).toBe(2)
    expect(work.totalCount).toBe(5) // 3 direct + 2 from client-a
    const personal = tree.find((n) => n.id === "personal")!
    expect(personal.totalCount).toBe(1)
  })

  it("treats an orphaned parentId (e.g. a soft-deleted parent) as root", () => {
    const flat = [...FLAT, project({ id: "orphan", parentId: "missing" })]
    const tree = buildProjectTree(flat)
    expect(tree.map((n) => n.id)).toContain("orphan")
  })
})

describe("flattenTree / findNode / descendantIds", () => {
  const tree = buildProjectTree(FLAT)

  it("flattens in display order, skipping collapsed subtrees", () => {
    expect(flattenTree(tree, () => false).map((n) => n.id)).toEqual([
      "work",
      "client-a",
      "personal",
    ])
    expect(
      flattenTree(tree, (id) => id === "work").map((n) => n.id)
    ).toEqual(["work", "personal"])
  })

  it("finds a node anywhere in the tree", () => {
    expect(findNode(tree, "client-a")?.id).toBe("client-a")
    expect(findNode(tree, "nope")).toBeNull()
  })

  it("collects a node and all its descendants", () => {
    expect([...descendantIds(tree, "work")].sort()).toEqual([
      "client-a",
      "work",
    ])
    expect([...descendantIds(tree, "client-a")]).toEqual(["client-a"])
  })
})

describe("isSelfOrDescendant (cycle / invalid-move detection)", () => {
  it("is true for the project itself", () => {
    expect(isSelfOrDescendant(FLAT, "work", "work")).toBe(true)
  })

  it("is true for a descendant", () => {
    expect(isSelfOrDescendant(FLAT, "work", "client-a")).toBe(true)
  })

  it("is false for an ancestor or an unrelated project", () => {
    expect(isSelfOrDescendant(FLAT, "client-a", "work")).toBe(false)
    expect(isSelfOrDescendant(FLAT, "personal", "client-a")).toBe(false)
  })

  it("does not infinite-loop on corrupt cyclic data", () => {
    const cyclic: ProjectDto[] = [
      project({ id: "a", parentId: "b" }),
      project({ id: "b", parentId: "a" }),
    ]
    expect(() => isSelfOrDescendant(cyclic, "a", "b")).not.toThrow()
  })
})

describe("ancestorChain", () => {
  it("returns root-to-parent order, excluding the node itself", () => {
    expect(ancestorChain(FLAT, "client-a").map((p) => p.id)).toEqual([
      "work",
    ])
    expect(ancestorChain(FLAT, "work")).toEqual([])
  })
})
