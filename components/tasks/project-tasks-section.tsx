"use client"

import { ListTodoIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { ProjectTabToolbar } from "@/components/projects/project-tab-toolbar"
import { QueryFeedback } from "@/components/query-feedback"
import { ListSkeleton } from "@/components/skeletons"
import { useShell } from "@/components/shell/shell-context"

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
  onIncludeDescendantsChange,
}: {
  projectId: string
  projectName: string
  includeDescendants: boolean
  onIncludeDescendantsChange: (include: boolean) => void
}) {
  const { openAddTask } = useShell()
  const { openTask } = useDetailDrawer()
  const { data: progress } = useProjectTaskProgress(
    projectId,
    includeDescendants
  )
  const filters = useMemo(
    () => ({
      projectId,
      includeDescendants,
      sort: "sortKey" as const,
      order: "asc" as const,
    }),
    [projectId, includeDescendants]
  )
  const query = useTaskList(filters)
  const { data } = query
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const openNewTask = () =>
    openAddTask(undefined, {
      defaultProject: { id: projectId, name: projectName },
    })

  return (
    <div>
      <ProjectTabToolbar
        includeDescendants={includeDescendants}
        onIncludeDescendantsChange={onIncludeDescendantsChange}
        actions={
          <>
            {progress?.total ? (
              <span className="text-xs text-subtle tabular-nums">
                {progress.done}/{progress.total} done
              </span>
            ) : null}
            <Button size="sm" onClick={openNewTask}>
              <PlusIcon />
              Add task
            </Button>
          </>
        }
      />
      <QueryFeedback query={query} label="project tasks" loading={false} />
      <div className="space-y-4">
        <QuickAddBar
          defaultProject={{ id: projectId, name: projectName }}
          autoFocus={false}
        />
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError && !query.data ? null : items.length ? (
          <TaskList items={items} groupBy="none" onOpen={openTask} />
        ) : (
          <EmptyState
            icon={ListTodoIcon}
            title="No tasks in this project yet"
            description="Add a task to plan the next step for this project."
          >
            <Button onClick={openNewTask}>
              <PlusIcon />
              Add first task
            </Button>
          </EmptyState>
        )}
      </div>
    </div>
  )
}
