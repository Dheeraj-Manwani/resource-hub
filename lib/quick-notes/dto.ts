import type { quickNotes } from "@/lib/db/schema"

export type QuickNoteDto = {
  id: string
  title: string | null
  bodyJson: unknown
  bodyText: string | null
  createdAt: string
  updatedAt: string
}

export function toQuickNoteDto(
  row: typeof quickNotes.$inferSelect
): QuickNoteDto {
  return {
    id: row.id,
    title: row.title,
    bodyJson: row.bodyJson,
    bodyText: row.bodyText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
