import type { TaskPriority, TaskStatus } from "./types"

/** Literal hex values mirroring the `--priority-*` tokens in `app/globals.css`
 * — for contexts (like FullCalendar's `backgroundColor`) that need an actual
 * color value rather than a Tailwind class. */
export const TASK_PRIORITY_HEX: Record<TaskPriority, string> = {
  low: "#737373",
  medium: "#eab308",
  high: "#ff7a1a",
  urgent: "#ef4444",
}

/** Mirrors the Tailwind classes in `components/tasks/task-status.tsx`. */
export const TASK_STATUS_HEX: Record<TaskStatus, string> = {
  todo: "#8a8a8a",
  in_progress: "#38bdf8",
  blocked: "#ef4444",
  done: "#34d399",
}
