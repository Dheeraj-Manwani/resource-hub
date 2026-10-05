"use client"

import dynamic from "next/dynamic"
import { AsyncDialogBoundary } from "@/components/async-dialog"
import { LoadingState } from "@/components/query-feedback"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"

const loading = () => (
  <div className="p-6">
    <SheetTitle className="sr-only">Opening details</SheetTitle>
    <LoadingState label="Opening details…" />
  </div>
)
const ResourceDetail = dynamic(
  () =>
    import("@/components/resources/resource-detail").then(
      (m) => m.ResourceDetail
    ),
  { ssr: false, loading }
)
const TaskDetail = dynamic(
  () => import("@/components/tasks/task-detail").then((m) => m.TaskDetail),
  { ssr: false, loading }
)

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
        <AsyncDialogBoundary
          key={target ? `${target.kind}:${target.id}` : "closed"}
          fallback={
            <div className="space-y-3 p-6">
              <SheetTitle>Couldn&apos;t open details</SheetTitle>
              <p role="alert">Reload the page to try again.</p>
              <Button onClick={close}>Close</Button>
            </div>
          }
        >
          {target?.kind === "resource" ? (
            <ResourceDetail key={target.id} id={target.id} />
          ) : target?.kind === "task" ? (
            <TaskDetail key={target.id} id={target.id} />
          ) : null}
        </AsyncDialogBoundary>
      </SheetContent>
    </Sheet>
  )
}
