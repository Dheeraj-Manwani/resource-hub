"use client"

import { useMemo } from "react"

import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress"
import { useProjectTaskProgress, useTaskList } from "@/hooks/queries/tasks"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"

import { QuickAddBar } from "./quick-add-bar"
import { TaskList } from "./task-list"

/** Project page's "Tasks" section: a done/total progress bar plus a compact
 * list, scoped to this project (and its sub-projects when `includeDescendants`
 * is on, matching the resource grid above it). */
export function ProjectTasksSection({
  projectId,
  projectName,
  includeDescendants,
}: {
  projectId: string
  projectName: string
  includeDescendants: boolean
}) {
  const { openTask } = useDetailDrawer()
  const { data: progress } = useProjectTaskProgress(projectId, includeDescendants)
  const filters = useMemo(
    () => ({ projectId, includeDescendants, sort: "sortKey" as const, order: "asc" as const }),
    [projectId, includeDescendants]
  )
  const { data } = useTaskList(filters)
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const pct = progress && progress.total ? (progress.done / progress.total) * 100 : 0

  return (
    <div className="mb-8 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-muted">Tasks</h2>
        {progress?.total ? (
          <span className="text-xs text-subtle tabular-nums">
            {progress.done}/{progress.total} done
          </span>
        ) : null}
      </div>
      {progress?.total ? (
        <Progress value={pct}>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      ) : null}
      <QuickAddBar defaultProject={{ id: projectId, name: projectName }} autoFocus={false} />
      {items.length ? (
        <TaskList items={items} groupBy="none" onOpen={openTask} />
      ) : (
        <p className="py-2 text-sm text-subtle">No tasks in this project yet.</p>
      )}
    </div>
  )
}
