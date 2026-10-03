import { describe, expect, it } from "vitest"

import { nextSortKey, sortKeyBetween } from "@/lib/projects/sort-key"

describe("nextSortKey", () => {
  it("orders after the previous key", () => {
    const a = nextSortKey(null)
    const b = nextSortKey(a)
    const c = nextSortKey(b)
    expect([a, b, c].sort()).toEqual([a, b, c])
  })
})

describe("sortKeyBetween", () => {
  it("sorts between its neighbors", () => {
    const first = nextSortKey(null)
    const third = nextSortKey(first)
    const second = sortKeyBetween(first, third)
    expect([first, second, third].sort()).toEqual([first, second, third])
  })

  it("works at either edge when a neighbor is missing", () => {
    const middle = nextSortKey(null)
    const before = sortKeyBetween(null, middle)
    const after = sortKeyBetween(middle, null)
    expect([before, middle, after].sort()).toEqual([before, middle, after])
  })

  it("can be used repeatedly to insert many items between two keys", () => {
    let lo = nextSortKey(null)
    const hi = nextSortKey(lo)
    const inserted: string[] = []
    for (let i = 0; i < 20; i++) {
      const key = sortKeyBetween(lo, hi)
      inserted.push(key)
      lo = key
    }
    const all = [inserted[0]!, ...inserted.slice(1), hi]
    expect([...all].sort()).toEqual(all)
  })
})
