"use client"

import { useId, useState, type ReactNode } from "react"
import { SlidersHorizontalIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Visibility never changes the applied filters or unmounts their inputs. */
export function FilterPanel({
  children,
  actions,
  activeCount = 0,
  open,
  onOpenChange,
}: {
  children: ReactNode
  actions?: ReactNode
  activeCount?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const visible = open ?? expanded
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-expanded={visible}
          aria-controls={id}
          onClick={() => {
            setExpanded(!visible)
            onOpenChange?.(!visible)
          }}
        >
          <SlidersHorizontalIcon />
          Filters
          {activeCount > 0 ? (
            <span
              className="rounded-full bg-brand-soft px-1.5 text-xs text-brand"
              aria-label={`${activeCount} active`}
            >
              {activeCount}
            </span>
          ) : null}
          <ChevronDownIcon className={visible ? "rotate-180" : undefined} />
        </Button>
        {actions ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div id={id} hidden={!visible}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
          {children}
        </div>
      </div>
    </div>
  )
}
