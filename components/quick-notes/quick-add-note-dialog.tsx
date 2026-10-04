"use client"

import { toast } from "react-hot-toast"

import { useShell } from "@/components/shell/shell-context"
import { useCreateQuickNote, useUpdateQuickNote } from "@/hooks/queries/quick-notes"

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

/** Shell-level "New quick note" dialog, opened from the top bar's Add
 * menu — the Quick Notes page itself still owns editing existing notes. */
export function QuickAddNoteDialog() {
  const { addQuickNote, closeAddQuickNote } = useShell()
  const createNote = useCreateQuickNote()
  const updateNote = useUpdateQuickNote()

  return (
    <QuickNoteDialog
      draft={addQuickNote ? EMPTY_DRAFT : null}
      onOpenChange={(open) => !open && closeAddQuickNote()}
      saving={createNote.isPending || updateNote.isPending}
      onSave={(next, opts: SaveOpts) => {
        const payload = {
          projectId: next.projectId,
          title: next.title || null,
          bodyJson: next.bodyJson,
          bodyText: next.bodyText,
        }
        const onSuccess = (note: { id: string }) => {
          opts.onSaved(note.id)
          toast.success("Note saved")
          if (!opts.keepOpen) closeAddQuickNote()
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
