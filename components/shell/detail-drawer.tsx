"use client"

import { ResourceDetail } from "@/components/resources/resource-detail"
import { TaskDetail } from "@/components/tasks/task-detail"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"

/** Right-hand drawer driven by `?r=<resourceId>` / `?t=<taskId>`. */
export function DetailDrawer() {
  const { target, close } = useDetailDrawer()

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 border-border bg-background p-0 data-[side=right]:w-full sm:data-[side=right]:max-w-[640px]"
      >
        {target?.kind === "resource" ? (
          <ResourceDetail key={target.id} id={target.id} />
        ) : target?.kind === "task" ? (
          <TaskDetail key={target.id} id={target.id} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
