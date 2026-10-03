"use client"

import { LinkIcon, ListPlusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useShell } from "./shell-context"
import { notifyTasksComingSoon } from "./top-bar"

export function MobileFab() {
  const { openAddResource } = useShell()
  return (
    <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-lg"
              className="size-14 rounded-full shadow-glow"
              aria-label="Add"
            />
          }
        >
          <PlusIcon className="size-6" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-48">
          <DropdownMenuItem onClick={() => openAddResource()}>
            <LinkIcon />
            Add resource
          </DropdownMenuItem>
          <DropdownMenuItem onClick={notifyTasksComingSoon}>
            <ListPlusIcon />
            Add task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
