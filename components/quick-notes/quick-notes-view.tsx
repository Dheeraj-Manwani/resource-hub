"use client"

import { QueryFeedback } from "@/components/query-feedback"

import { NotebookPenIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"
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
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [restoring, setRestoring] = useState<string | null>(null)
  const qc = useQueryClient()
  const trashQuery = useQuery({
    queryKey: ["docs-trash"],
    queryFn: () => api<{ items: QuickNoteDto[] }>("/api/v1/docs/trash"),
    enabled: filter === "trash",
  })
  const shown = (
    filter === "trash" ? (trashQuery.data?.items ?? []) : notes
  ).filter(
    (note) =>
      (filter === "all" || filter === "trash" || note.kind === filter) &&
      `${note.title ?? ""} ${note.bodyText ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  async function restore(id: string) {
    setRestoring(id)
    try {
      await api("/api/v1/docs/trash", { method: "POST", body: { id } })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["docs-trash"] }),
        qc.invalidateQueries({ queryKey: ["quick-notes"] }),
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed")
    } finally {
      setRestoring(null)
    }
  }

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
      kind: note.kind,
      revision: note.revision,
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
      kind: next.kind,
      expectedRevision: next.revision,
      title: next.title || null,
      bodyJson: next.bodyJson,
      bodyText: next.bodyText,
    }
    const onSuccess = (note: QuickNoteDto) => {
      const currentSaved = opts.onSaved(note.id, note.revision)
      toast.success("Doc saved")
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
        title="Docs"
        description="Text docs, spreadsheets, and drawings for your ideas, plans, and trackers."
        actions={
          <Button size="sm" onClick={openNew}>
            <PlusIcon />
            New doc
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          ["all", "All"],
          ["text", "Text"],
          ["spreadsheet", "Spreadsheets"],
          ["drawing", "Drawings"],
          ["trash", "Trash"],
        ].map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
        <Input
          aria-label="Search docs"
          placeholder="Search titles and content…"
          className="min-w-48 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <QueryFeedback
        query={filter === "trash" ? trashQuery : notesQuery}
        label="docs"
        loading={false}
      />
      {isPending || (filter === "trash" && trashQuery.isPending) ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : notesQuery.isError && !notesQuery.data ? null : shown.length === 0 ? (
        <EmptyState
          icon={NotebookPenIcon}
          title={filter === "trash" ? "Trash is empty" : "No matching docs"}
          description={
            filter === "trash"
              ? "Deleted docs appear here until you restore them."
              : "Create a doc or adjust your filters."
          }
        >
          <Button size="sm" onClick={openNew}>
            <PlusIcon />
            New doc
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((note) =>
            filter === "trash" ? (
              <div key={note.id} className="rounded-xl border p-4">
                <p className="mb-3 truncate">{note.title || "Untitled"}</p>
                <Button
                  size="sm"
                  disabled={restoring !== null}
                  loading={restoring === note.id}
                  onClick={() => void restore(note.id)}
                >
                  Restore
                </Button>
              </div>
            ) : (
              <QuickNoteCard
                key={note.id}
                note={note}
                onOpen={() => openExisting(note)}
                onDelete={() => setDeleting(note)}
              />
            )
          )}
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
        description="This doc will move to Docs Trash. You can restore it later."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return
          await deleteNote.mutateAsync(deleting.id)
          await qc.invalidateQueries({ queryKey: ["docs-trash"] })
          if (deleting.id === draft?.id) setDraft(null)
        }}
      />
    </>
  )
}
