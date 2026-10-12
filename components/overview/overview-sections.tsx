"use client"

import type { ComponentType } from "react"
import { HabitsToday } from "@/components/habits/habits-today"
import {
  sectionsForRegion,
  type OverviewConfiguration,
  type OverviewSectionConfig,
  type OverviewSectionId,
} from "@/lib/overview/sections"
import { DailyBriefSection } from "./daily-brief-section"
import { NeedsAttentionSection } from "./needs-attention-section"
import { ProjectNextStepsSection } from "./project-next-steps-section"
import { RecentDocsSection } from "./recent-docs-section"
import { ResourcesToReviewSection } from "./resources-to-review-section"
import { TaskPrioritiesSection } from "./task-priorities-section"
import type {
  OverviewSectionContext,
  OverviewSectionProps,
} from "./section-context"

/** Keep components out of the serializable registry used by account settings. */
const SECTION_RENDERERS = {
  "daily-brief": DailyBriefSection,
  "habits-today": HabitsToday,
  "task-priorities": TaskPrioritiesSection,
  "project-next-steps": ProjectNextStepsSection,
  "needs-attention": NeedsAttentionSection,
  "recent-docs": RecentDocsSection,
  "resources-to-review": ResourcesToReviewSection,
} satisfies Record<OverviewSectionId, ComponentType<OverviewSectionProps>>

function OverviewSection({
  section,
  context,
}: {
  section: OverviewSectionConfig
  context: OverviewSectionContext
}) {
  const Component = SECTION_RENDERERS[section.id]
  return <Component {...context} options={section.options} />
}

export function OverviewSections({
  configuration,
  context,
}: {
  configuration: OverviewConfiguration
  context: OverviewSectionContext
}) {
  const top = sectionsForRegion(configuration, "top")
  const main = sectionsForRegion(configuration, "main")
  const aside = sectionsForRegion(configuration, "aside")
  const bottom = sectionsForRegion(configuration, "bottom")
  const renderSections = (sections: OverviewSectionConfig[]) =>
    sections.map((section) => (
      <OverviewSection key={section.id} section={section} context={context} />
    ))

  return (
    <>
      {renderSections(top)}
      {(main.length > 0 || aside.length > 0) && (
        <div
          className={
            main.length > 0 && aside.length > 0
              ? "grid items-start gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(220px,1fr)]"
              : "grid items-start gap-7"
          }
        >
          {main.length > 0 && (
            <div className="min-w-0 space-y-7">{renderSections(main)}</div>
          )}
          {aside.length > 0 && (
            <aside className="min-w-0 space-y-7">{renderSections(aside)}</aside>
          )}
        </div>
      )}
      {renderSections(bottom)}
    </>
  )
}
