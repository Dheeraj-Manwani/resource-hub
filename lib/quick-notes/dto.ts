import type { quickNotes } from "@/lib/db/schema"

export type QuickNoteProjectDto = {
  id: string
  name: string
  icon: string | null
  color: string | null
}

export type QuickNoteDto = {
  id: string
  projectId: string | null
  project: QuickNoteProjectDto | null
  title: string | null
  bodyJson: unknown
  bodyText: string | null
  createdAt: string
  updatedAt: string
}

export function toQuickNoteDto(
  row: typeof quickNotes.$inferSelect,
  project: QuickNoteProjectDto | null = null
): QuickNoteDto {
  return {
    id: row.id,
    projectId: row.projectId,
    project: row.projectId ? project : null,
    title: row.title,
    bodyJson: row.bodyJson,
    bodyText: row.bodyText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
