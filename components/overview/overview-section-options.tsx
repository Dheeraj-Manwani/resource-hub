"use client"

import { useId } from "react"
import {
  OVERVIEW_SECTION_LIMITS,
  OVERVIEW_SECTION_REGISTRY,
  type OverviewSectionConfig,
  type OverviewSectionOptions,
} from "@/lib/overview/sections"

const selectClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"

export function OverviewSectionOptionsEditor({
  section,
  projectPaths,
  disabled,
  onChange,
}: {
  section: OverviewSectionConfig
  projectPaths: Record<string, string>
  disabled: boolean
  onChange: (patch: OverviewSectionOptions) => void
}) {
  const id = useId()
  const maximum = OVERVIEW_SECTION_LIMITS[section.id]
  const unavailableProject =
    section.options.projectId &&
    section.options.projectId !== "unassigned" &&
    !projectPaths[section.options.projectId]
  return (
    <fieldset
      disabled={disabled}
      className="w-full min-w-0 border-t border-border pt-3 pb-1"
    >
      <legend className="sr-only">
        {OVERVIEW_SECTION_REGISTRY[section.id].label} options
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-width`} className="text-xs font-medium">
            Desktop width
          </label>
          <select
            id={`${id}-width`}
            className={selectClass}
            value={section.options.width ?? "default"}
            onChange={(event) =>
              onChange({
                width:
                  event.target.value === "default"
                    ? undefined
                    : (event.target.value as "standard" | "full"),
              })
            }
          >
            <option value="default">Default width</option>
            <option value="standard">One column</option>
            <option value="full">Full width</option>
          </select>
          <p className="mt-1 text-xs text-subtle">
            Sections stack in your chosen order on mobile.
          </p>
        </div>
        {maximum && (
          <div>
            <label htmlFor={`${id}-limit`} className="text-xs font-medium">
              {section.id === "docs-by-project"
                ? "Docs per project"
                : section.id === "needs-attention"
                  ? "Blocked tasks shown"
                  : section.id === "habits-today"
                    ? "Planned habits shown"
                    : "Items shown"}
            </label>
            <select
              id={`${id}-limit`}
              className={selectClass}
              value={section.options.limit ?? "default"}
              onChange={(event) =>
                onChange({
                  limit:
                    event.target.value === "default"
                      ? undefined
                      : Number(event.target.value),
                })
              }
            >
              <option value="default">Default (up to {maximum})</option>
              {Array.from({ length: maximum }, (_, index) => index + 1).map(
                (limit) => (
                  <option key={limit} value={limit}>
                    Up to {limit}
                  </option>
                )
              )}
            </select>
            <p className="mt-1 text-xs text-subtle">
              Summary counts still include all items.
            </p>
          </div>
        )}
        {section.id === "task-priorities" && (
          <div>
            <label htmlFor={`${id}-horizon`} className="text-xs font-medium">
              Default task view
            </label>
            <select
              id={`${id}-horizon`}
              className={selectClass}
              value={section.options.initialHorizon ?? "today"}
              onChange={(event) =>
                onChange({
                  initialHorizon: event.target.value as "today" | "week",
                })
              }
            >
              <option value="today">Today</option>
              <option value="week">Next 7 days</option>
            </select>
          </div>
        )}
        {section.id === "docs-by-project" && (
          <div>
            <label htmlFor={`${id}-project`} className="text-xs font-medium">
              Default project
            </label>
            <select
              id={`${id}-project`}
              className={selectClass}
              value={section.options.projectId ?? "all"}
              onChange={(event) =>
                onChange({
                  projectId:
                    event.target.value === "all"
                      ? undefined
                      : event.target.value,
                })
              }
            >
              <option value="all">Recently edited projects</option>
              <option value="unassigned">No project</option>
              {unavailableProject && (
                <option value={section.options.projectId} disabled>
                  Unavailable project (showing all)
                </option>
              )}
              {Object.entries(projectPaths)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([projectId, name]) => (
                  <option key={projectId} value={projectId}>
                    {name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
    </fieldset>
  )
}
