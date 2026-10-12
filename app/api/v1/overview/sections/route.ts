import { overviewSectionQuerySchema } from "@/lib/overview/section-data"
import { json, parseQuery, route } from "@/lib/server/api"
import {
  getDocsByProject,
  getFavoriteResources,
  getProjectsNeedingAttention,
  getRecentlyCompletedTasks,
} from "@/lib/server/dal/overview-sections"
import { requireApiUser } from "@/lib/server/dal/session"
import {
  getHabitStreaks,
  getWeeklyHabitProgress,
  getRecentHabitActivity,
} from "@/lib/server/dal/overview-habits"

export const GET = route(async (request) => {
  const user = await requireApiUser()
  const { section, projectId } = parseQuery(request, overviewSectionQuerySchema)
  switch (section) {
    case "recently-completed-tasks":
      return json(await getRecentlyCompletedTasks(user.id))
    case "projects-needing-attention":
      return json(await getProjectsNeedingAttention(user.id))
    case "favorite-resources":
      return json(await getFavoriteResources(user.id))
    case "docs-by-project":
      return json(await getDocsByProject(user.id, projectId))
    case "habit-streaks":
      return json(await getHabitStreaks(user.id))
    case "weekly-habit-progress":
      return json(await getWeeklyHabitProgress(user.id))
    case "recent-habit-activity":
      return json(await getRecentHabitActivity(user.id))
  }
})
