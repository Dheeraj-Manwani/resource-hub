"use client"

import { createContext, useContext } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import type { ResourceDto } from "@/lib/resources/dto"
import { displayTitle } from "@/lib/resources/dto"

export const ResourceChecklistContext = createContext<{
  checkedIds: Set<string>
  pending: boolean
  onCheck: (resourceId: string, checked: boolean) => void
} | null>(null)

export function ResourceChecklistCheckbox({
  resource,
}: {
  resource: ResourceDto
}) {
  const checklist = useContext(ResourceChecklistContext)
  if (!checklist) return null
  const checked = checklist.checkedIds.has(resource.id)
  return (
    <label
      data-interactive
      className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs text-text-muted"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Checkbox
        checked={checked}
        disabled={checklist.pending}
        aria-label={`Mark ${displayTitle(resource)} as ${checked ? "pending" : "done"}`}
        onCheckedChange={(value) => checklist.onCheck(resource.id, value)}
      />
      {checked ? "Done" : "Mark done"}
    </label>
  )
}
