import { z } from "zod"
import type { ProjectDto } from "@/lib/projects/types"
import type { ResourceDto } from "@/lib/resources/dto"
import type { TaskDto } from "@/lib/tasks/types"
import {
  HABIT_OVERVIEW_SECTION_IDS,
  type HabitStreaksData,
  type WeeklyHabitProgressData,
  type RecentHabitActivityData,
} from "./habit-sections"
import {
  isPastDue,
  projectSummaries,
  type DocSummary,
  type FocusSignal,
  type OverviewWindow,
  type TaskSignal,
} from "./model"

export const ADDITIONAL_OVERVIEW_SECTION_IDS = [
  "recently-completed-tasks",
  "projects-needing-attention",
  "favorite-resources",
  "docs-by-project",
  ...HABIT_OVERVIEW_SECTION_IDS,
] as const
export type AdditionalOverviewSectionId =
  (typeof ADDITIONAL_OVERVIEW_SECTION_IDS)[number]

export const overviewSectionQuerySchema = z
  .object({
    section: z.enum(ADDITIONAL_OVERVIEW_SECTION_IDS),
    projectId: z.union([z.uuid(), z.literal("unassigned")]).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.projectId && query.section !== "docs-by-project")
      context.addIssue({
        code: "custom",
        message: "Only docs can be filtered by project",
        path: ["projectId"],
      })
  })

export type AttentionProject = ProjectDto & {
  overdueCount: number
  blockedCount: number
  subprojectCount: number
  attentionTask: TaskDto | null
}

export type OverviewSectionData = {
  "recently-completed-tasks": { items: TaskDto[] }
  "projects-needing-attention": { items: AttentionProject[]; total: number }
  "favorite-resources": { items: ResourceDto[]; hasMore: boolean }
  "docs-by-project": {
    groups: { projectId: string | null; total: number; docs: DocSummary[] }[]
  }
  "habit-streaks": HabitStreaksData
  "weekly-habit-progress": WeeklyHabitProgressData
  "recent-habit-activity": RecentHabitActivityData
}

/** Use the same recurrence and descendant rules as the daily overview. */
export function attentionProjectSignals(
  projects: ProjectDto[],
  tasks: TaskSignal[],
  signals: FocusSignal[],
  window: OverviewWindow
) {
  return projectSummaries(projects, tasks, signals, [], [], window)
    .filter((project) => project.overdueCount > 0 || project.blockedCount > 0)
    .map((project) => ({
      project,
      attentionTaskId:
        signals.find(
          (signal) =>
            signal.projectId &&
            project.memberProjectIds.includes(signal.projectId) &&
            isPastDue(signal, window)
        )?.taskId ??
        tasks.find(
          (task) =>
            task.status === "blocked" &&
            task.projectId &&
            project.memberProjectIds.includes(task.projectId)
        )?.id ??
        null,
    }))
}
