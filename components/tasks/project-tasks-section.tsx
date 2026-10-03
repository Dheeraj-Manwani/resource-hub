"use client"

import { useMemo } from "react"

import { useProjectTaskProgress, useTaskList } from "@/hooks/queries/tasks"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"

import { QuickAddBar } from "./quick-add-bar"
import { TaskList } from "./task-list"

/** Project page's "Tasks" tab: a done/total count plus a compact list,
 * scoped to this project (and its sub-projects when `includeDescendants`
 * is on, matching the resource grid). */
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

  return (
    <div className="mb-8 space-y-2">
      <div className="flex h-6 items-center justify-end">
        {progress?.total ? (
          <span className="text-xs text-subtle tabular-nums">
            {progress.done}/{progress.total} done
          </span>
        ) : null}
      </div>
      <QuickAddBar defaultProject={{ id: projectId, name: projectName }} autoFocus={false} />
      {items.length ? (
        <TaskList items={items} groupBy="none" onOpen={openTask} />
      ) : (
        <p className="py-2 text-sm text-subtle">No tasks in this project yet.</p>
      )}
    </div>
  )
}
