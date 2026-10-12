import { describe, expect, it } from "vitest"
import {
  createDefaultOverviewConfiguration,
  OVERVIEW_SECTION_REGISTRY,
  sectionsForRegion,
} from "@/lib/overview/sections"

describe("overview section configuration", () => {
  it("keeps the existing default layout and task horizon", () => {
    const configuration = createDefaultOverviewConfiguration()
    expect(sectionsForRegion(configuration, "top").map((s) => s.id)).toEqual([
      "daily-brief",
    ])
    expect(sectionsForRegion(configuration, "main").map((s) => s.id)).toEqual([
      "habits-today",
      "task-priorities",
      "project-next-steps",
    ])
    expect(sectionsForRegion(configuration, "aside").map((s) => s.id)).toEqual([
      "needs-attention",
      "recent-docs",
    ])
    expect(sectionsForRegion(configuration, "bottom").map((s) => s.id)).toEqual(
      ["resources-to-review"]
    )
    expect(
      configuration.sections.find((s) => s.id === "task-priorities")?.options
    ).toEqual({ initialHorizon: "today" })
  })

  it("honors disabled sections, changed regions and array order without mutating configuration", () => {
    const configuration = createDefaultOverviewConfiguration()
    configuration.sections.reverse()
    configuration.sections.find((s) => s.id === "habits-today")!.enabled = false
    configuration.sections.find((s) => s.id === "recent-docs")!.region = "main"
    const before = JSON.stringify(configuration)

    expect(sectionsForRegion(configuration, "main").map((s) => s.id)).toEqual([
      "recent-docs",
      "project-next-steps",
      "task-priorities",
    ])
    expect(JSON.stringify(configuration)).toBe(before)
    configuration.sections.forEach((section) => {
      section.enabled = false
    })
    expect(sectionsForRegion(configuration, "main")).toEqual([])
  })

  it("isolates editable drafts from each other and the registry defaults", () => {
    const first = createDefaultOverviewConfiguration()
    const second = createDefaultOverviewConfiguration()
    first.sections.find(
      (s) => s.id === "task-priorities"
    )!.options.initialHorizon = "week"
    first.sections[0].enabled = false
    first.sections.pop()

    expect(second.sections).toHaveLength(7)
    expect(second.sections[0].enabled).toBe(true)
    expect(
      second.sections.find((s) => s.id === "task-priorities")?.options
        .initialHorizon
    ).toBe("today")
    expect(
      OVERVIEW_SECTION_REGISTRY["task-priorities"].defaults.options
        .initialHorizon
    ).toBe("today")
  })
})
