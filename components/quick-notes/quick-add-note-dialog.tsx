"use client"

import { useMemo } from "react"
import { toast } from "react-hot-toast"

import { useShell } from "@/components/shell/shell-context"
import {
  useCreateQuickNote,
  useUpdateQuickNote,
} from "@/hooks/queries/quick-notes"

import {
  QuickNoteDialog,
  type QuickNoteDraft,
  type SaveOpts,
} from "./quick-note-dialog"

const EMPTY_DRAFT: QuickNoteDraft = {
  id: null,
  projectId: null,
  title: "",
  bodyJson: null,
  bodyText: null,
}

/** Shell-level "New doc" dialog, opened from the top bar's Add
 * menu — the Docs page itself still owns editing existing notes. */
export function QuickAddNoteDialog() {
  const { addQuickNote, quickNoteProjectId, closeAddQuickNote } = useShell()
  const createNote = useCreateQuickNote()
  const updateNote = useUpdateQuickNote()
  const draft = useMemo(
    () =>
      addQuickNote
        ? { ...EMPTY_DRAFT, projectId: quickNoteProjectId ?? null }
        : null,
    [addQuickNote, quickNoteProjectId]
  )

  return (
    <QuickNoteDialog
      draft={draft}
      onOpenChange={(open) => !open && closeAddQuickNote()}
      saving={createNote.isPending || updateNote.isPending}
      onSave={(next, opts: SaveOpts) => {
        const payload = {
          projectId: next.projectId,
          kind: next.kind,
          expectedRevision: next.revision,
          title: next.title || null,
          bodyJson: next.bodyJson,
          bodyText: next.bodyText,
        }
        const onSuccess = (note: { id: string; revision: number }) => {
          const currentSaved = opts.onSaved(note.id, note.revision)
          toast.success("Doc saved")
          if (currentSaved && !opts.keepOpen) closeAddQuickNote()
        }
        // Ctrl/Cmd+S may have already created this note on an earlier
        // keep-open save — update it in place instead of creating another.
        if (next.id) {
          updateNote.mutate({ id: next.id, ...payload }, { onSuccess })
        } else {
          createNote.mutate(payload, { onSuccess })
        }
      }}
    />
  )
}
