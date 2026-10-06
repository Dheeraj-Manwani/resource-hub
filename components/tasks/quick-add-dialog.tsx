"use client"

import { useIsMutating } from "@tanstack/react-query"
import { useShell } from "@/components/shell/shell-context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { QuickAddBar } from "./quick-add-bar"

/** Shell-level "Add task" dialog, opened from the top bar or the `Q` shortcut. */
export function QuickAddDialog() {
  const { addTask, closeAddTask } = useShell()
  const creating = useIsMutating({ mutationKey: ["task", "create"] }) > 0
  return (
    <Dialog
      open={addTask.open}
      onOpenChange={(open) => !open && !creating && closeAddTask()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        {addTask.open ? (
          <QuickAddBar
            initialText={addTask.initialText}
            defaultProject={addTask.defaultProject}
            resourceIds={addTask.resourceIds}
            onDone={closeAddTask}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
