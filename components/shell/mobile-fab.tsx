"use client"

import {
  FolderPlusIcon,
  LinkIcon,
  ListPlusIcon,
  NotebookPenIcon,
  PlusIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useShell } from "./shell-context"

export function MobileFab() {
  const { openAddResource, openAddTask, openAddProject, openAddQuickNote } =
    useShell()
  return (
    <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              data-tour="tour-add-menu"
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
          <DropdownMenuItem onClick={() => openAddTask()}>
            <ListPlusIcon />
            Add task
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openAddProject()}>
            <FolderPlusIcon />
            New project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openAddQuickNote()}>
            <NotebookPenIcon />
            New quick note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
