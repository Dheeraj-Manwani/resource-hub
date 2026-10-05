"use client"

import { PendingCreations } from "@/components/pending-creations"

import { QueryFeedback } from "@/components/query-feedback"

import { NotebookPenIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "react-hot-toast"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCreateQuickNote,
  useDeleteQuickNote,
  useQuickNotes,
  useUpdateQuickNote,
} from "@/hooks/queries/quick-notes"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"

import { QuickNoteCard } from "./quick-note-card"
import {
  QuickNoteDialog,
  type QuickNoteDraft,
  type SaveOpts,
} from "./quick-note-dialog"

export function QuickNotesView() {
  const notesQuery = useQuickNotes()
  const { data: notes = [], isPending } = notesQuery
  const createNote = useCreateQuickNote()
  const updateNote = useUpdateQuickNote()
  const deleteNote = useDeleteQuickNote()
  const [draft, setDraft] = useState<QuickNoteDraft | null>(null)
  const [deleting, setDeleting] = useState<QuickNoteDto | null>(null)

  const saving = createNote.isPending || updateNote.isPending

  function openNew() {
    setDraft({
      id: null,
      projectId: null,
      title: "",
      bodyJson: null,
      bodyText: null,
    })
  }

  function openExisting(note: QuickNoteDto) {
    setDraft({
      id: note.id,
      projectId: note.projectId,
      project: note.project,
      title: note.title ?? "",
      bodyJson: note.bodyJson,
      bodyText: note.bodyText,
    })
  }

  function handleSave(next: QuickNoteDraft, opts: SaveOpts) {
    const payload = {
      projectId: next.projectId,
      title: next.title || null,
      bodyJson: next.bodyJson,
      bodyText: next.bodyText,
    }
    const onSuccess = (note: QuickNoteDto) => {
      const currentSaved = opts.onSaved(note.id)
      toast.success("Note saved")
      if (currentSaved && !opts.keepOpen) setDraft(null)
    }
    if (next.id) {
      updateNote.mutate({ id: next.id, ...payload }, { onSuccess })
    } else {
      createNote.mutate(payload, { onSuccess })
    }
  }

  return (
    <>
      <PageHeader
        title="Quick Notes"
        description="A scratchpad for loose ideas — jot things down now, turn them into resources or tasks later."
        actions={
          <Button size="sm" onClick={openNew}>
            <PlusIcon />
            New note
          </Button>
        }
      />

      {/* <QueryFeedback query={notesQuery} label="notes" loading={false} />
      <PendingCreations entity="quick-note" /> */}
      {isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : notesQuery.isError && !notesQuery.data ? null : notes.length === 0 ? (
        <EmptyState
          icon={NotebookPenIcon}
          title="No quick notes yet"
          description="Throw a random idea in here. You can shape it into a resource or task whenever you're ready."
        >
          <Button size="sm" onClick={openNew}>
            <PlusIcon />
            New note
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <QuickNoteCard
              key={note.id}
              note={note}
              onOpen={() => openExisting(note)}
              onDelete={() => setDeleting(note)}
            />
          ))}
        </div>
      )}

      <QuickNoteDialog
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
        onSave={handleSave}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.title || "Untitled"}"?`}
        description="This note is permanently deleted. This can't be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return
          await deleteNote.mutateAsync(deleting.id)
          if (deleting.id === draft?.id) setDraft(null)
        }}
      />
    </>
  )
}
