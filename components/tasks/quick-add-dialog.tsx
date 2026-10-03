"use client"

import { useShell } from "@/components/shell/shell-context"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { QuickAddBar } from "./quick-add-bar"

/** Shell-level "Add task" dialog, opened from the top bar or the `Q` shortcut. */
export function QuickAddDialog() {
  const { addTask, closeAddTask } = useShell()
  return (
    <Dialog open={addTask.open} onOpenChange={(open) => !open && closeAddTask()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <QuickAddBar initialText={addTask.initialText} onDone={closeAddTask} />
      </DialogContent>
    </Dialog>
  )
}
