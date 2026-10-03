"use client"

import { ListTodoIcon } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { ResourceDetail } from "@/components/resources/resource-detail"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
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
          <div className="p-6 pt-14">
            <SheetTitle className="sr-only">Task</SheetTitle>
            <EmptyState
              icon={ListTodoIcon}
              title="Tasks arrive in Phase 4"
              description="This drawer will show the task's description, checklist and linked resources."
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
