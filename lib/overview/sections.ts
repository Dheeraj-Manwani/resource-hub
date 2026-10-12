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
  width?: "standard" | "full"
  limit?: number
  initialHorizon?: "today" | "week"
  projectId?: string
}

/** Overview lists are bounded summaries; their full views remain available. */
export const OVERVIEW_SECTION_LIMITS: Partial<
  Record<OverviewSectionId, number>
> = {
  "habits-today": 4,
  "task-priorities": 6,
  "project-next-steps": 3,
  "needs-attention": 2,
  "recent-docs": 3,
  "resources-to-review": 3,
  "recently-completed-tasks": 5,
  "projects-needing-attention": 4,
  "favorite-resources": 5,
  "docs-by-project": 3,
  "habit-streaks": 5,
  "weekly-habit-progress": 5,
  "recent-habit-activity": 6,
}

export function overviewSectionLimit(
  id: OverviewSectionId,
  options: OverviewSectionOptions
): number {
  return options.limit ?? OVERVIEW_SECTION_LIMITS[id] ?? 0
}

export function overviewSectionIsFullWidth(
  section: OverviewSectionConfig
): boolean {
  return section.options.width
    ? section.options.width === "full"
    : section.region === "top" || section.region === "bottom"
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
    supportedOptions: ["width"],
  },
  "habits-today": {
    label: "Habits today",
    entity: "habits",
    defaults: { enabled: true, region: "main", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "task-priorities": {
    label: "What needs doing",
    entity: "tasks",
    defaults: {
      enabled: true,
      region: "main",
      options: { initialHorizon: "today" },
    },
    supportedOptions: ["width", "limit", "initialHorizon"],
  },
  "project-next-steps": {
    label: "Move a project forward",
    entity: "projects",
    defaults: { enabled: true, region: "main", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "needs-attention": {
    label: "Needs attention",
    entity: "mixed",
    defaults: { enabled: true, region: "aside", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "recent-docs": {
    label: "Continue editing",
    entity: "docs",
    defaults: { enabled: true, region: "aside", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "resources-to-review": {
    label: "Saved to revisit",
    entity: "resources",
    defaults: { enabled: true, region: "bottom", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "recently-completed-tasks": {
    label: "Recently completed tasks",
    entity: "tasks",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "projects-needing-attention": {
    label: "Projects needing attention",
    entity: "projects",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "favorite-resources": {
    label: "Favorite resources",
    entity: "resources",
    defaults: { enabled: false, region: "bottom", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "docs-by-project": {
    label: "Docs by project",
    entity: "docs",
    defaults: { enabled: false, region: "aside", options: {} },
    supportedOptions: ["width", "limit", "projectId"],
  },
  "habit-streaks": {
    label: "Habit streaks",
    entity: "habits",
    defaults: { enabled: false, region: "aside", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "weekly-habit-progress": {
    label: "Weekly habit progress",
    entity: "habits",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: ["width", "limit"],
  },
  "recent-habit-activity": {
    label: "Recent habit activity",
    entity: "habits",
    defaults: { enabled: false, region: "main", options: {} },
    supportedOptions: ["width", "limit"],
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
              .object({
                width: z.enum(["standard", "full"]).optional(),
                limit: z.number().int().min(1).optional(),
                initialHorizon: z.enum(["today", "week"]).optional(),
                projectId: z
                  .union([z.uuid(), z.literal("unassigned")])
                  .optional(),
              })
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
      const maximum = OVERVIEW_SECTION_LIMITS[section.id]
      if (
        section.options.limit !== undefined &&
        (!maximum || section.options.limit > maximum)
      )
        context.addIssue({
          code: "custom",
          message: maximum
            ? `This section supports up to ${maximum} items`
            : "This section does not support an item limit",
          path: ["sections", index, "options", "limit"],
        })
      const supported: readonly (keyof OverviewSectionOptions)[] =
        OVERVIEW_SECTION_REGISTRY[section.id].supportedOptions
      for (const option of Object.keys(
        section.options
      ) as (keyof OverviewSectionOptions)[])
        if (
          section.options[option] !== undefined &&
          !supported.includes(option)
        )
          context.addIssue({
            code: "custom",
            message: `This section does not support ${option}`,
            path: ["sections", index, "options", option],
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

export function setOverviewSectionOptions(
  configuration: OverviewConfiguration,
  id: OverviewSectionId,
  patch: OverviewSectionOptions
): OverviewConfiguration {
  return {
    ...configuration,
    layout: "width" in patch ? "ordered" : configuration.layout,
    sections: configuration.sections.map((section) => {
      if (section.id !== id) return section
      const options = { ...section.options, ...patch }
      // Removing an override restores the default and leaves a serializable draft.
      for (const key of Object.keys(
        options
      ) as (keyof OverviewSectionOptions)[])
        if (options[key] === undefined) delete options[key]
      return { ...section, options }
    }),
  }
}

export function sectionsForRegion(
  configuration: OverviewConfiguration,
  region: OverviewSectionRegion
): OverviewSectionConfig[] {
  return configuration.sections.filter(
    (section) => section.enabled && section.region === region
  )
}
