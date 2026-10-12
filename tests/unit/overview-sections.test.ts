import { describe, expect, it } from "vitest"
import {
  createDefaultOverviewConfiguration,
  OVERVIEW_SECTION_REGISTRY,
  OVERVIEW_SECTION_IDS,
  sectionsForRegion,
  overviewConfigurationSchema,
  readOverviewConfiguration,
  reorderOverviewSection,
  setOverviewSectionEnabled,
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

    expect(second.sections).toHaveLength(OVERVIEW_SECTION_IDS.length)
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

  it("reorders sections across regions and restores hidden sections at the end", () => {
    const original = createDefaultOverviewConfiguration()
    const before = JSON.stringify(original)
    const hidden = setOverviewSectionEnabled(original, "habits-today", false)
    const moved = reorderOverviewSection(hidden, "recent-docs", "daily-brief")
    const restored = setOverviewSectionEnabled(moved, "habits-today", true)
    expect(restored.layout).toBe("ordered")
    expect(restored.sections.filter((s) => s.enabled).map((s) => s.id)).toEqual(
      [
        "recent-docs",
        "daily-brief",
        "task-priorities",
        "project-next-steps",
        "needs-attention",
        "resources-to-review",
        "habits-today",
      ]
    )
    expect(JSON.stringify(original)).toBe(before)
    expect(reorderOverviewSection(hidden, "habits-today", "daily-brief")).toBe(
      hidden
    )
    expect(reorderOverviewSection(original, "daily-brief", "daily-brief")).toBe(
      original
    )
  })

  it("supports an empty overview and keeps omitted sections hidden in the picker", () => {
    const empty = readOverviewConfiguration({
      version: 1,
      layout: "ordered",
      sections: [],
    })
    expect(empty.sections).toHaveLength(OVERVIEW_SECTION_IDS.length)
    expect(empty.sections.every((s) => !s.enabled)).toBe(true)
    const restored = setOverviewSectionEnabled(empty, "recent-docs", true)
    expect(restored.sections.filter((s) => s.enabled).map((s) => s.id)).toEqual(
      ["recent-docs"]
    )
  })

  it("validates version, IDs, duplicates, fields, and section-specific options", () => {
    const defaults = createDefaultOverviewConfiguration()
    expect(overviewConfigurationSchema.safeParse(defaults).success).toBe(true)
    for (const invalid of [
      { ...defaults, version: 2 },
      { ...defaults, layout: "unknown" },
      { ...defaults, unexpected: true },
      { ...defaults, sections: [{ ...defaults.sections[0], id: "unknown" }] },
      { ...defaults, sections: [defaults.sections[0], defaults.sections[0]] },
      {
        ...defaults,
        sections: [
          { ...defaults.sections[0], options: { initialHorizon: "today" } },
        ],
      },
      {
        ...defaults,
        sections: [
          { ...defaults.sections[2], options: { initialHorizon: "year" } },
        ],
      },
      {
        ...defaults,
        sections: [{ ...defaults.sections[0], options: { unknown: true } }],
      },
    ]) {
      expect(overviewConfigurationSchema.safeParse(invalid).success).toBe(false)
      expect(readOverviewConfiguration(invalid)).toEqual(defaults)
    }
    const phaseOne = { version: defaults.version, sections: defaults.sections }
    expect(readOverviewConfiguration(phaseOne)).toEqual(defaults)
    expect(readOverviewConfiguration(null)).toEqual(defaults)
  })

  it("adds new entity sections to old saved configurations without enabling them", () => {
    const defaults = createDefaultOverviewConfiguration()
    const previous = { ...defaults, sections: defaults.sections.slice(0, 7) }
    const restored = readOverviewConfiguration(previous)
    expect(restored.sections.slice(0, 7)).toEqual(previous.sections)
    expect(
      restored.sections
        .slice(7, 11)
        .map((section) => [section.id, section.enabled])
    ).toEqual([
      ["recently-completed-tasks", false],
      ["projects-needing-attention", false],
      ["favorite-resources", false],
      ["docs-by-project", false],
    ])
  })
  it("keeps new habit sections hidden when restoring Phase 3 preferences", () => {
    const defaults = createDefaultOverviewConfiguration()
    const saved = {
      ...defaults,
      layout: "ordered",
      sections: defaults.sections.slice(0, 11).reverse(),
    }
    const restored = readOverviewConfiguration(saved)
    expect(restored.sections.slice(0, 11)).toEqual(saved.sections)
    expect(
      restored.sections
        .slice(11)
        .map((section) => [section.id, section.enabled])
    ).toEqual([
      ["habit-streaks", false],
      ["weekly-habit-progress", false],
      ["recent-habit-activity", false],
    ])
  })
})
