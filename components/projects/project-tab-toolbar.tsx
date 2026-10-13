"use client"

import type { ReactNode } from "react"
import { FilterPanel } from "@/components/filter-panel"
import { Switch } from "@/components/ui/switch"

type ProjectScopeProps = {
  includeDescendants: boolean
  onIncludeDescendantsChange: (include: boolean) => void
}

export function ProjectScopeFilter({
  includeDescendants,
  onIncludeDescendantsChange,
}: ProjectScopeProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <Switch
        size="sm"
        checked={includeDescendants}
        onCheckedChange={onIncludeDescendantsChange}
      />
      Include sub-projects
    </label>
  )
}

/** Matches the resource toolbar: filters first, actions on the right, content below. */
export function ProjectTabToolbar({
  actions,
  ...scope
}: ProjectScopeProps & { actions: ReactNode }) {
  return (
    <FilterPanel
      activeCount={scope.includeDescendants ? 1 : 0}
      actions={actions}
    >
      <ProjectScopeFilter {...scope} />
    </FilterPanel>
  )
}
