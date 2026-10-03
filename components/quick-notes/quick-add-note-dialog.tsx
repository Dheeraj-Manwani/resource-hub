"use client"

import { toast } from "sonner"

import { useShell } from "@/components/shell/shell-context"
import { useCreateQuickNote } from "@/hooks/queries/quick-notes"

import { QuickNoteDialog, type QuickNoteDraft } from "./quick-note-dialog"

const EMPTY_DRAFT: QuickNoteDraft = {
  id: null,
  title: "",
  bodyJson: null,
  bodyText: null,
}

/** Shell-level "New quick note" dialog, opened from the top bar's Add
 * menu — the Quick Notes page itself still owns editing existing notes. */
export function QuickAddNoteDialog() {
  const { addQuickNote, closeAddQuickNote } = useShell()
  const createNote = useCreateQuickNote()

  return (
    <QuickNoteDialog
      draft={addQuickNote ? EMPTY_DRAFT : null}
      onOpenChange={(open) => !open && closeAddQuickNote()}
      saving={createNote.isPending}
      onSave={(next) => {
        createNote.mutate(
          { title: next.title || null, bodyJson: next.bodyJson, bodyText: next.bodyText },
          {
            onSuccess: () => {
              toast.success("Note saved")
              closeAddQuickNote()
            },
          }
        )
      }}
    />
  )
}
