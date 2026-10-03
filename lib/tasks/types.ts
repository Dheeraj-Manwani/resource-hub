export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
}

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}


export type ChecklistItemDto = {
  id: string
  title: string
  done: boolean
  sortKey: string
}

export type TaskTagDto = { id: string; name: string; color: string | null }

export type TaskProjectDto = {
  id: string
  name: string
  icon: string | null
  color: string | null
}

export type TaskResourceDto = {
  id: string
  type: string
  title: string | null
  url: string | null
  thumbnailUrl: string | null
}

export type TaskDto = {
  id: string
  projectId: string | null
  project: TaskProjectDto | null
  title: string
  descriptionJson: Record<string, unknown> | null
  descriptionText: string | null
  status: TaskStatus
  priority: TaskPriority
  startAt: string | null
  dueAt: string | null
  startDate: string | null
  dueDate: string | null
  allDay: boolean
  completedAt: string | null
  archivedAt: string | null
  sortKey: string
  checklist: ChecklistItemDto[]
  tags: TaskTagDto[]
  resources: TaskResourceDto[]
  createdAt: string
  updatedAt: string
}

export type TaskPage = { items: TaskDto[]; nextCursor: string | null }

export function checklistProgress(checklist: ChecklistItemDto[]) {
  const done = checklist.filter((i) => i.done).length
  return { done, total: checklist.length }
}
