import type { OverviewSummary } from "@/lib/overview/model"
import type { OverviewSectionOptions } from "@/lib/overview/sections"

export type OverviewSectionActions = {
  openTask: (id: string) => void
  openResource: (id: string) => void
  openPreview: (id: string) => void
  openDoc: (id: string) => void
  openAddTask: () => void
  openAddProject: () => void
  openAddQuickNote: (projectId?: string) => void
  openAddResource: () => void
  reviewResources: () => void
}

export type OverviewSectionContext = {
  data: OverviewSummary
  actions: OverviewSectionActions
}

export type OverviewSectionProps = OverviewSectionContext & {
  options: OverviewSectionOptions
}
