"use client"

import { CircleCheckIcon, CircleIcon, PencilIcon } from "lucide-react"
import { ItemMenu } from "@/components/ui/item-menu"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import type { CalendarOccurrence } from "@/lib/server/dal/calendar"
import { cn } from "@/lib/utils"
import { useCallback, useState } from "react"

export function CalendarEventMenu({
  occurrence: occ,
  onOpen,
  onToggle,
  disabled,
}: {
  occurrence: CalendarOccurrence
  onOpen: () => void
  onToggle: () => void
  disabled: boolean
}) {
  const [contextTarget, setContextTarget] = useState<HTMLElement | null>(null)
  const attach = useCallback((node: HTMLDivElement | null) => {
    setContextTarget(node?.closest<HTMLElement>(".fc-event") ?? null)
  }, [])
  return (
    <ItemMenu
      contextTarget={contextTarget}
      trigger={
        <div
          ref={attach}
          className="flex w-full items-center gap-1 overflow-hidden px-1 py-0.5"
        />
      }
      label={`${occ.title} options`}
      buttonClassName="size-5 text-inherit"
      actions={
        <>
          <DropdownMenuItem onClick={onOpen}>
            <PencilIcon />
            Open / edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disabled} onClick={onToggle}>
            {occ.status === "done" ? <CircleIcon /> : <CircleCheckIcon />}
            {occ.status === "done" ? "Mark as not done" : "Mark as done"}
          </DropdownMenuItem>
        </>
      }
    >
      <input
        type="checkbox"
        checked={occ.status === "done"}
        aria-label={`Mark ${occ.title} ${occ.status === "done" ? "incomplete" : "complete"}`}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        className="size-3 shrink-0"
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          occ.status === "done" && "line-through opacity-70"
        )}
      >
        {occ.title}
      </span>
    </ItemMenu>
  )
}
