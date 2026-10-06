"use client"

import type { ReactNode } from "react"
import { PlusIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function AddMenu({ items, size = "sm" }: {
  items: { label: string; icon?: ReactNode; onSelect: () => void }[]
  size?: "sm" | "xs"
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button size={size} />}>
      <PlusIcon />Add<ChevronDownIcon className="size-3.5 opacity-70" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {items.map((item) => <DropdownMenuItem key={item.label} onClick={item.onSelect}>{item.icon}{item.label}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
}
