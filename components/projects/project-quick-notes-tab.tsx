"use client"

import { AddMenu } from "@/components/add-menu"

import { PendingCreations } from "@/components/pending-creations"

import { QueryFeedback } from "@/components/query-feedback"

import { ListPlusIcon, NotebookPenIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "react-hot-toast"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import {
  QuickNoteDialog,
  type QuickNoteDraft,
  type SaveOpts,
} from "@/components/quick-notes/quick-note-dialog"
import { QuickNoteCard } from "@/components/quick-notes/quick-note-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useCreateQuickNote,
  useDeleteQuickNote,
  useQuickNotes,
  useUpdateQuickNote,
} from "@/hooks/queries/quick-notes"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"

import { AddExistingQuickNoteDialog } from "./add-existing-quick-note-dialog"

/** Project page's "Notes" tab: quick notes linked to this project (and its
 * sub-projects when "Include sub-projects" is on), with the same card grid
 * as the standalone Quick Notes page. */
export function ProjectQuickNotesTab({
  projectId,
  includeDescendants,
}: {
  projectId: string
  includeDescendants: boolean
}) {
  const notesQuery = useQuickNotes({
    projectId,
    includeDescendants,
  })
  const { data: notes = [], isPending } = notesQuery
  const createNote = useCreateQuickNote()
  const updateNote = useUpdateQuickNote()
  const deleteNote = useDeleteQuickNote()
  const [draft, setDraft] = useState<QuickNoteDraft | null>(null)
  const [deleting, setDeleting] = useState<QuickNoteDto | null>(null)
  const [addingExisting, setAddingExisting] = useState(false)

  const saving = createNote.isPending || updateNote.isPending

  function openNew() {
    setDraft({
      id: null,
      projectId,
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
    <div>
      <div className="mb-2 flex justify-end">
        <AddMenu
          size="xs"
          items={[
            { label: "Add new note", icon: <PlusIcon />, onSelect: openNew },
            {
              label: "Add existing notes",
              icon: <ListPlusIcon />,
              onSelect: () => setAddingExisting(true),
            },
          ]}
        />
      </div>

      <QueryFeedback query={notesQuery} label="project notes" loading={false} />
      <PendingCreations
        entity="quick-note"
        filters={{ projectId, includeDescendants }}
      />
      {isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : notesQuery.isError && !notesQuery.data ? null : notes.length === 0 ? (
        <EmptyState
          icon={NotebookPenIcon}
          title="No quick notes linked"
          description="Jot a new note scoped to this project, or link one you already wrote."
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
              hideProject={!includeDescendants}
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

      <AddExistingQuickNoteDialog
        projectId={projectId}
        open={addingExisting}
        onOpenChange={setAddingExisting}
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
    </div>
  )
}
