import { z } from "zod"

/** Serializable metadata shared by the overview renderer and account settings. */
export const OVERVIEW_SECTION_IDS = [
  "daily-brief",
  "habits-today",
  "task-priorities",
  "project-next-steps",
  "needs-attention",
  "recent-docs",
  "resources-to-review",
  "recently-completed-tasks",
  "projects-needing-attention",
  "favorite-resources",
  "docs-by-project",
  "habit-streaks",
  "weekly-habit-progress",
  "recent-habit-activity",
] as const

export type OverviewSectionId = (typeof OVERVIEW_SECTION_IDS)[number]
export type OverviewSectionEntity =
  "tasks" | "projects" | "resources" | "docs" | "habits" | "mixed"

/** Regions preserve the default layout and determine full-width sections when reordered. */
export type OverviewSectionRegion = "top" | "main" | "aside" | "bottom"

export type OverviewSectionOptions = {
  initialHorizon?: "today" | "week"
}

export type OverviewSectionConfig = {
  id: OverviewSectionId
  enabled: boolean
  region: OverviewSectionRegion
  options: OverviewSectionOptions
}

export type OverviewConfiguration = {
  version: 1
  layout: "default" | "ordered"
  /** Ordered layouts use this sequence on desktop and mobile. */
  sections: OverviewSectionConfig[]
}

type OverviewSectionDefinition = {
  label: string
  entity: OverviewSectionEntity
  defaults: Omit<OverviewSectionConfig, "id">
  supportedOptions: readonly (keyof OverviewSectionOptions)[]
}

export const OVERVIEW_SECTION_REGISTRY = {
  "daily-brief": {
    label: "Daily brief",
    entity: "mixed",
    defaults: { enabled: true, region: "top", options: {} },
    supportedOptions: [],
  },
  "habits-today": {
    label: "Habits today",
    entity: "habits",
    defaults: { enabled: true, region: "main", options: {} },
    supportedOptions: [],
  },
  "task-priorities": {
    label: "What needs doing",
    entity: "tasks",
    defaults: {
      enabled: true,
      region: "main",
      options: { initialHorizon: "today" },
    },
    supportedOptions: ["initialHorizon"],
  },
  "project-next-steps": {
    label: "Move a project forward",
    entity: "projects",
    defaults: { enabled: true, region: "main", options: {} },
    supportedOptions: [],
  },
  "needs-attention": {
    label: "Needs attention",
    entity: "mixed",
    defaults: { enabled: true, region: "aside", options: {} },
    supportedOptions: [],
  },
  "recent-docs": {
    label: "Continue editing",
    entity: "docs",
    defaults: { enabled: true, region: "aside", options: {} },
    supportedOptions: [],
  },
  "resources-to-review": {
    label: "Saved to revisit",
    entity: "resources",
    defaults: { enabled: true, region: "bottom", options: {} },
    supportedOptions: [],
  },
  "recently-completed-tasks": {
    label: "Recently completed tasks",
    entity: "tasks",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: [],
  },
  "projects-needing-attention": {
    label: "Projects needing attention",
    entity: "projects",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: [],
  },
  "favorite-resources": {
    label: "Favorite resources",
    entity: "resources",
    defaults: { enabled: false, region: "bottom", options: {} },
    supportedOptions: [],
  },
  "docs-by-project": {
    label: "Docs by project",
    entity: "docs",
    defaults: { enabled: false, region: "aside", options: {} },
    supportedOptions: [],
  },
  "habit-streaks": {
    label: "Habit streaks",
    entity: "habits",
    defaults: { enabled: false, region: "aside", options: {} },
    supportedOptions: [],
  },
  "weekly-habit-progress": {
    label: "Weekly habit progress",
    entity: "habits",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: [],
  },
  "recent-habit-activity": {
    label: "Recent habit activity",
    entity: "habits",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: [],
  },
} satisfies Record<OverviewSectionId, OverviewSectionDefinition>

/** Return fresh objects so editing a draft never mutates the shared defaults. */
export function createDefaultOverviewConfiguration(): OverviewConfiguration {
  return {
    version: 1,
    layout: "default",
    sections: OVERVIEW_SECTION_IDS.map((id) => {
      const { defaults } = OVERVIEW_SECTION_REGISTRY[id]
      return { id, ...defaults, options: { ...defaults.options } }
    }),
  }
}

export const overviewConfigurationSchema = z
  .object({
    version: z.literal(1),
    // Accept Phase 1 configurations that predate the layout field.
    layout: z.enum(["default", "ordered"]).default("default"),
    sections: z
      .array(
        z
          .object({
            id: z.enum(OVERVIEW_SECTION_IDS),
            enabled: z.boolean(),
            region: z.enum(["top", "main", "aside", "bottom"]),
            options: z
              .object({ initialHorizon: z.enum(["today", "week"]).optional() })
              .strict(),
          })
          .strict()
      )
      .max(OVERVIEW_SECTION_IDS.length),
  })
  .strict()
  .superRefine((configuration, context) => {
    const seen = new Set<OverviewSectionId>()
    configuration.sections.forEach((section, index) => {
      if (seen.has(section.id))
        context.addIssue({
          code: "custom",
          message: "Each section can appear only once",
          path: ["sections", index, "id"],
        })
      seen.add(section.id)
      if (
        section.id !== "task-priorities" &&
        section.options.initialHorizon !== undefined
      )
        context.addIssue({
          code: "custom",
          message: "This section does not support a task view",
          path: ["sections", index, "options", "initialHorizon"],
        })
    })
  })

/** Missing/new section types stay in the picker instead of appearing unexpectedly. */
export function readOverviewConfiguration(
  value: unknown
): OverviewConfiguration {
  const result = overviewConfigurationSchema.safeParse(value)
  if (!result.success) return createDefaultOverviewConfiguration()
  const saved = result.data
  const present = new Set(saved.sections.map((section) => section.id))
  return {
    ...saved,
    sections: [
      ...saved.sections,
      ...createDefaultOverviewConfiguration()
        .sections.filter((section) => !present.has(section.id))
        .map((section) => ({ ...section, enabled: false })),
    ],
  }
}

export function setOverviewSectionEnabled(
  configuration: OverviewConfiguration,
  id: OverviewSectionId,
  enabled: boolean
): OverviewConfiguration {
  const section = configuration.sections.find((section) => section.id === id)
  if (!section || section.enabled === enabled) return configuration
  const changed = { ...section, enabled }
  return {
    ...configuration,
    layout: "ordered",
    sections: enabled
      ? [
          ...configuration.sections.filter((section) => section.id !== id),
          changed,
        ]
      : configuration.sections.map((section) =>
          section.id === id ? changed : section
        ),
  }
}

export function reorderOverviewSection(
  configuration: OverviewConfiguration,
  id: OverviewSectionId,
  target: OverviewSectionId
): OverviewConfiguration {
  const from = configuration.sections.findIndex(
    (section) => section.id === id && section.enabled
  )
  const to = configuration.sections.findIndex(
    (section) => section.id === target && section.enabled
  )
  if (from < 0 || to < 0 || from === to) return configuration
  const sections = [...configuration.sections]
  const [section] = sections.splice(from, 1)
  sections.splice(to, 0, section)
  return { ...configuration, layout: "ordered", sections }
}

export function sectionsForRegion(
  configuration: OverviewConfiguration,
  region: OverviewSectionRegion
): OverviewSectionConfig[] {
  return configuration.sections.filter(
    (section) => section.enabled && section.region === region
  )
}
