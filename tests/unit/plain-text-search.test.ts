import { describe, expect, it } from "vitest"
import { EditorState } from "@codemirror/state"
import { SearchQuery } from "@codemirror/search"
import {
  countSearchMatches,
  searchCountLimit,
} from "@/lib/docs/plain-text-search"

describe("plain-text search counts", () => {
  const state = EditorState.create({
    doc: "cat Cat scatter cat\ncafé caféine 👋\n",
  })
  it("uses the same case and whole-word matching as navigation and replacement", () => {
    expect(
      countSearchMatches(state, new SearchQuery({ search: "cat" })).count
    ).toBe(4)
    expect(
      countSearchMatches(
        state,
        new SearchQuery({ search: "cat", caseSensitive: true })
      ).count
    ).toBe(3)
    expect(
      countSearchMatches(
        state,
        new SearchQuery({ search: "cat", wholeWord: true })
      ).count
    ).toBe(3)
    expect(
      countSearchMatches(
        state,
        new SearchQuery({ search: "cat", caseSensitive: true, wholeWord: true })
      ).count
    ).toBe(2)
    expect(
      countSearchMatches(
        state,
        new SearchQuery({ search: "café", wholeWord: true })
      ).count
    ).toBe(1)
    expect(
      countSearchMatches(state, new SearchQuery({ search: "👋" })).count
    ).toBe(1)
  })
  it("keeps normal-mode backslashes literal and supports regex across lines", () => {
    const text = EditorState.create({ doc: "one\\ntwo\none\ntwo" })
    expect(
      countSearchMatches(
        text,
        new SearchQuery({ search: "\\n", literal: true })
      ).count
    ).toBe(1)
    expect(
      countSearchMatches(
        text,
        new SearchQuery({ search: "one\\ntwo", regexp: true })
      ).count
    ).toBe(1)
  })
  it("reports empty, invalid, absent and zero-width regex matches without looping", () => {
    for (const search of ["", "missing", "["])
      expect(
        countSearchMatches(state, new SearchQuery({ search, regexp: true }))
      ).toEqual({ count: 0, capped: false })
    expect(
      countSearchMatches(
        state,
        new SearchQuery({ search: "(?=cat)", regexp: true })
      ).count
    ).toBe(4)
  })
  it("marks capped counts explicitly rather than reporting an inaccurate total", () => {
    const query = new SearchQuery({ search: "a" })
    expect(
      countSearchMatches(
        EditorState.create({ doc: "a".repeat(searchCountLimit) }),
        query
      )
    ).toEqual({ count: searchCountLimit, capped: false })
    expect(
      countSearchMatches(
        EditorState.create({ doc: "a".repeat(searchCountLimit + 1) }),
        query
      )
    ).toEqual({ count: searchCountLimit, capped: true })
  })
})
