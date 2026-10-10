import { describe, expect, it } from "vitest"
import {
  sidebarLayout,
  type SidebarTreeRow,
} from "@/lib/projects/sidebar-layout"
import type { ProjectDto } from "@/lib/projects/types"

function project(
  id: string,
  parentId: string | null = null,
  sortKey = "a0"
): ProjectDto {
  return {
    id,
    parentId,
    name: id,
    sortKey,
    description: null,
    icon: null,
    color: null,
    archivedAt: null,
    directCount: 0,
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-10T00:00:00Z",
  }
}
const flat = [
  project("work"),
  project("active", "work"),
  project("inactive", "work", "a1"),
  project("grandchild", "inactive"),
  project("personal", null, "a1"),
]
const ids = (rows: SidebarTreeRow[]) =>
  rows.flatMap((row) => (row.type === "project" ? [row.node.id] : []))

describe("sidebar project visibility", () => {
  it("keeps the existing tree until a selection is made, including new projects", () => {
    expect(ids(sidebarLayout(flat, null, () => false, new Set()))).toEqual([
      "work",
      "active",
      "inactive",
      "grandchild",
      "personal",
    ])
  })
  it("keeps a selected child's full parent path and groups unused siblings at their original level", () => {
    const rows = sidebarLayout(flat, ["active"], () => false, new Set())
    expect(ids(rows)).toEqual(["work", "active"])
    expect(rows.filter((row) => row.type === "more")).toEqual([
      { type: "more", parentId: "work", depth: 1, count: 2, expanded: false },
      { type: "more", parentId: null, depth: 0, count: 1, expanded: false },
    ])
  })
  it("expands hidden branches once, keeping real parents and depths for drag and drop", () => {
    const rows = sidebarLayout(
      flat,
      ["active"],
      () => false,
      new Set(["work", null])
    )
    expect(ids(rows)).toEqual([
      "work",
      "active",
      "inactive",
      "grandchild",
      "personal",
    ])
    expect(new Set(ids(rows)).size).toBe(flat.length)
    const grandchild = rows.find(
      (row) => row.type === "project" && row.node.id === "grandchild"
    )
    expect(grandchild).toMatchObject({
      node: { parentId: "inactive", depth: 2 },
    })
  })
  it("honors project collapse inside selected and More branches", () => {
    expect(
      ids(
        sidebarLayout(flat, ["active"], (id) => id === "work", new Set([null]))
      )
    ).toEqual(["work", "personal"])
    expect(
      ids(sidebarLayout(flat, [], (id) => id === "inactive", new Set([null])))
    ).toEqual(["work", "active", "inactive", "personal"])
  })
  it("allows an empty selection and ignores stale deleted-project IDs", () => {
    const rows = sidebarLayout(flat, ["missing"], () => false, new Set())
    expect(ids(rows)).toEqual([])
    expect(rows).toEqual([
      { type: "more", parentId: null, depth: 0, count: 5, expanded: false },
    ])
    expect(sidebarLayout(flat, [], () => false, new Set())).toEqual(rows)
  })
  it("keeps an orphaned selected project visible", () => {
    expect(
      ids(
        sidebarLayout(
          [project("orphan", "deleted")],
          ["orphan"],
          () => false,
          new Set()
        )
      )
    ).toEqual(["orphan"])
  })
})
