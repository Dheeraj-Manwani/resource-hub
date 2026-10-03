import { describe, expect, it } from "vitest"

import { parseSnippet, SNIPPET_END, SNIPPET_START } from "@/lib/search/snippet"

describe("parseSnippet", () => {
  it("splits plain text with no matches into one unhighlighted part", () => {
    expect(parseSnippet("no matches here")).toEqual([
      { text: "no matches here", highlighted: false },
    ])
  })

  it("marks a single match as highlighted", () => {
    expect(
      parseSnippet(`Taarak ${SNIPPET_START}Mehta${SNIPPET_END} Ka Show`)
    ).toEqual([
      { text: "Taarak ", highlighted: false },
      { text: "Mehta", highlighted: true },
      { text: " Ka Show", highlighted: false },
    ])
  })

  it("handles multiple matches", () => {
    expect(
      parseSnippet(
        `${SNIPPET_START}foo${SNIPPET_END} bar ${SNIPPET_START}baz${SNIPPET_END}`
      )
    ).toEqual([
      { text: "foo", highlighted: true },
      { text: " bar ", highlighted: false },
      { text: "baz", highlighted: true },
    ])
  })

  it("never crashes on an unterminated sentinel", () => {
    expect(parseSnippet(`before ${SNIPPET_START}dangling`)).toEqual([
      { text: "before ", highlighted: false },
      { text: "dangling", highlighted: false },
    ])
  })

  it("handles an empty string", () => {
    expect(parseSnippet("")).toEqual([])
  })
})
