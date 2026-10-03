import "server-only"

import type { ProjectDto } from "@/lib/projects/types"
import type { ResourceDto } from "@/lib/resources/dto"
import type { TaskDto } from "@/lib/tasks/types"

import { getProjectTree } from "./projects"
import { listResources, resourceOverviewCounts } from "./resources"
import { listTasks, smartFilterCounts, taskDashboardCounts, taskProgressForProjects } from "./tasks"

export type OverviewTopProject = ProjectDto & { taskDone: number; taskTotal: number }

export type OverviewSummary = {
  tasks: {
    /** Due later today, not already overdue. */
    dueToday: number
    /** Past their due date and not done. */
    pastDue: number
    completedToday: number
    /** Every open (not done, not archived) task. */
    activeTotal: number
    /** Most urgent open tasks (overdue first, then due today), for the "in focus" list. */
    upNext: TaskDto[]
  }
  resources: {
    total: number
    favorites: number
    inbox: number
    recent: ResourceDto[]
  }
  projects: {
    total: number
    top: OverviewTopProject[]
  }
}

const TOP_PROJECT_COUNT = 4

/** Everything the Overview (home) page needs, in one request: today's task
 * focus, library snapshot, and the most recently active projects. Each piece
 * reuses the same DAL functions the dedicated pages call, so the numbers
 * always agree with what Library/Tasks/Projects show. */
export async function getOverview(userId: string): Promise<OverviewSummary> {
  const [smartCounts, dashboardCounts, upNext, resourceCounts, recent, tree] = await Promise.all([
    smartFilterCounts(userId),
    taskDashboardCounts(userId),
    listTasks(userId, { limit: 6, sort: "due", order: "asc", smartFilter: "today" }),
    resourceOverviewCounts(userId),
    listResources(userId, { limit: 6, sort: "created", order: "desc" }),
    getProjectTree(userId),
  ])

  const activeProjects = tree.filter((p) => !p.archivedAt)
  const topProjects = [...activeProjects]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, TOP_PROJECT_COUNT)
  const progress = await Promise.all(
    topProjects.map((p) => taskProgressForProjects(userId, [p.id]))
  )

  return {
    tasks: {
      dueToday: Math.max(0, smartCounts.today - smartCounts.overdue),
      pastDue: smartCounts.overdue,
      completedToday: dashboardCounts.completedToday,
      activeTotal: dashboardCounts.active,
      upNext: upNext.items,
    },
    resources: {
      total: resourceCounts.total,
      favorites: resourceCounts.favorites,
      inbox: resourceCounts.inbox,
      recent: recent.items,
    },
    projects: {
      total: activeProjects.length,
      top: topProjects.map((p, i) => ({
        ...p,
        taskDone: progress[i]?.done ?? 0,
        taskTotal: progress[i]?.total ?? 0,
      })),
    },
  }
}
